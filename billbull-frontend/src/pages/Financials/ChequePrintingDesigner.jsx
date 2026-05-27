import React, { useState, useRef, useCallback, useEffect } from "react";
import {
    ArrowLeft, Save, Trash2, Eye, AlignLeft, AlignCenter, AlignRight, Bold,
    ChevronDown, RotateCcw, Lock, Unlock, Image as ImageIcon,
} from "lucide-react";
import toast from "react-hot-toast";

const SIZE_PRESETS = {
    "uae-standard": { label: "UAE Standard (216 × 96 mm)", w: 216, h: 96 },
    "us-standard": { label: "US Standard (215.9 × 88.9 mm)", w: 215.9, h: 88.9 },
    "a4-voucher":  { label: "A4 Voucher Cheque (210 × 99 mm)", w: 210, h: 99 },
    "custom":      { label: "Custom Size", w: 216, h: 96 },
};

const DEFAULT_FIELDS = [
    { id: "payee", label: "Pay To / Account Name", sampleValue: "Al Mansoori Trading LLC",
      enabled: true, x: 18, y: 32, width: 55, fontSize: 12,
      fontFamily: "Arial, sans-serif", fontWeight: "normal", fontStyle: "normal",
      color: "#000000", textAlign: "left", locked: false },
    { id: "date", label: "Date", sampleValue: "22 / 05 / 2026",
      enabled: true, x: 75, y: 14, width: 22, fontSize: 11,
      fontFamily: "Arial, sans-serif", fontWeight: "normal", fontStyle: "normal",
      color: "#000000", textAlign: "center", locked: false },
    { id: "amount-digits", label: "Amount (Digits)", sampleValue: "AED 15,000.00",
      enabled: true, x: 72, y: 32, width: 25, fontSize: 13,
      fontFamily: "Arial, sans-serif", fontWeight: "bold", fontStyle: "normal",
      color: "#000000", textAlign: "right", locked: false },
    { id: "amount-words", label: "Amount in Words", sampleValue: "Fifteen Thousand Dirhams Only",
      enabled: true, x: 8, y: 52, width: 80, fontSize: 11,
      fontFamily: "Arial, sans-serif", fontWeight: "normal", fontStyle: "normal",
      color: "#000000", textAlign: "left", locked: false },
    { id: "memo", label: "Memo / Narration", sampleValue: "Payment against Invoice SI-2026-0521",
      enabled: true, x: 8, y: 72, width: 60, fontSize: 9,
      fontFamily: "Arial, sans-serif", fontWeight: "normal", fontStyle: "italic",
      color: "#444444", textAlign: "left", locked: false },
    { id: "ref", label: "Reference / Voucher No.", sampleValue: "PV-2026-0099",
      enabled: true, x: 72, y: 72, width: 25, fontSize: 9,
      fontFamily: "Arial, sans-serif", fontWeight: "normal", fontStyle: "normal",
      color: "#444444", textAlign: "right", locked: false },
    { id: "account-no", label: "Bank Account No.", sampleValue: "1012-345678-001",
      enabled: false, x: 8, y: 85, width: 35, fontSize: 9,
      fontFamily: "Courier New, monospace", fontWeight: "normal", fontStyle: "normal",
      color: "#1e3a5f", textAlign: "left", locked: false },
];

export function defaultChequePrintSettings(name = "Default Cheque Template") {
    return {
        templateName: name,
        sizePreset: "uae-standard",
        widthMm: 216,
        heightMm: 96,
        backgroundImageUrl: "",
        showGrid: true,
        showRuler: true,
        fields: DEFAULT_FIELDS.map(f => ({ ...f })),
    };
}

function Toggle({ checked, onChange }) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`relative inline-flex items-center rounded-full transition-colors flex-shrink-0 ${checked ? "bg-[#F5C742]" : "bg-gray-200"}`}
            style={{ height: 18, width: 32 }}
        >
            <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
    );
}

function FieldAlignIcon({ align }) {
    if (align === "center") return <AlignCenter className="w-3 h-3" />;
    if (align === "right") return <AlignRight className="w-3 h-3" />;
    return <AlignLeft className="w-3 h-3" />;
}

const FONT_FAMILIES = [
    "Arial, sans-serif", "Helvetica, sans-serif", "Times New Roman, serif",
    "Georgia, serif", "Courier New, monospace", "Inter, sans-serif", "Verdana, sans-serif",
];

export default function ChequePrintingDesigner({ templateName, initialSettings, onClose, onSave }) {
    const [settings, setSettings] = useState(() => ({
        ...defaultChequePrintSettings(templateName),
        ...(initialSettings || {}),
    }));
    const [selectedFieldId, setSelectedFieldId] = useState(null);
    const [zoom, setZoom] = useState(100);
    const [expandedFields, setExpandedFields] = useState(new Set());
    const [showPreviewMode, setShowPreviewMode] = useState(false);
    const [activeTab, setActiveTab] = useState("setup");

    const canvasRef = useRef(null);
    const dragState = useRef(null);
    const fileInputRef = useRef(null);

    const setField = useCallback((id, patch) => {
        setSettings(s => ({
            ...s,
            fields: s.fields.map(f => f.id === id ? { ...f, ...patch } : f),
        }));
    }, []);

    const set = useCallback((patch) => {
        setSettings(s => ({ ...s, ...patch }));
    }, []);

    const PX_PER_MM = 3.78;
    const canvasW = settings.widthMm * PX_PER_MM;
    const canvasH = settings.heightMm * PX_PER_MM;
    const scaledW = canvasW * (zoom / 100);
    const scaledH = canvasH * (zoom / 100);

    const handleFieldMouseDown = useCallback((e, fieldId) => {
        const field = settings.fields.find(f => f.id === fieldId);
        if (!field || field.locked || showPreviewMode) return;
        e.preventDefault();
        e.stopPropagation();
        setSelectedFieldId(fieldId);
        dragState.current = {
            fieldId,
            startX: e.clientX, startY: e.clientY,
            origX: field.x, origY: field.y,
        };
    }, [settings.fields, showPreviewMode]);

    useEffect(() => {
        const onMouseMove = (e) => {
            if (!dragState.current || !canvasRef.current) return;
            const { fieldId, startX, startY, origX, origY } = dragState.current;
            const dx = ((e.clientX - startX) / scaledW) * 100;
            const dy = ((e.clientY - startY) / scaledH) * 100;
            const field = settings.fields.find(f => f.id === fieldId);
            if (!field) return;
            const newX = Math.max(0, Math.min(100 - field.width, origX + dx));
            const newY = Math.max(0, Math.min(95, origY + dy));
            setField(fieldId, { x: Math.round(newX * 10) / 10, y: Math.round(newY * 10) / 10 });
        };
        const onMouseUp = () => { dragState.current = null; };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, [scaledW, scaledH, settings.fields, setField]);

    const handleImageUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) { toast.error("Please upload an image file"); return; }
        const reader = new FileReader();
        reader.onload = ev => {
            set({ backgroundImageUrl: ev.target?.result });
            toast.success("Cheque background uploaded");
        };
        reader.readAsDataURL(file);
    };

    const handleSizePreset = (preset) => {
        const { w, h } = SIZE_PRESETS[preset];
        set({ sizePreset: preset, widthMm: w, heightMm: h });
    };

    const selectedField = settings.fields.find(f => f.id === selectedFieldId) ?? null;

    const toggleExpand = (id) => {
        setExpandedFields(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    return (
        <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b px-5 py-3 flex items-center justify-between flex-shrink-0 shadow-sm">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={settings.templateName}
                                onChange={e => set({ templateName: e.target.value })}
                                className="font-semibold text-gray-900 bg-transparent border-none outline-none focus:bg-gray-50 rounded px-1 text-sm"
                            />
                            <span className="text-[10px] uppercase tracking-wide border border-gray-200 rounded px-1.5 py-0.5 text-gray-600">Cheque Printing</span>
                        </div>
                        <p className="text-xs text-gray-400">Drag fields to position · Click to select</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => set({ showGrid: !settings.showGrid })}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${settings.showGrid ? "bg-gray-100 border-gray-300 text-gray-700" : "border-gray-200 text-gray-400"}`}
                    >
                        Grid
                    </button>

                    <button
                        onClick={() => setShowPreviewMode(!showPreviewMode)}
                        className={`px-3 py-1.5 text-xs rounded-lg border flex items-center gap-1.5 transition-colors ${showPreviewMode ? "bg-[#F5C742] border-[#F5C742] text-gray-900 font-medium" : "border-gray-200 text-gray-600"}`}
                    >
                        <Eye className="w-3.5 h-3.5" />
                        {showPreviewMode ? "Editing" : "Preview"}
                    </button>

                    <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
                        <button onClick={() => setZoom(z => Math.max(50, z - 10))} className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-gray-900 font-bold text-base">−</button>
                        <span className="text-xs font-medium text-gray-700 w-9 text-center">{zoom}%</span>
                        <button onClick={() => setZoom(z => Math.min(200, z + 10))} className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-gray-900 font-bold text-base">+</button>
                    </div>

                    <button
                        onClick={() => onSave(settings)}
                        className="inline-flex items-center bg-[#F5C742] hover:bg-[#e5b732] text-gray-900 font-semibold text-sm rounded-md px-3 py-1.5"
                    >
                        <Save className="w-4 h-4 mr-1.5" />
                        Save Template
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Left Panel */}
                <div className="w-72 bg-white border-r flex flex-col overflow-hidden flex-shrink-0">
                    <div className="flex border-b">
                        {["setup", "fields"].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`flex-1 py-2.5 text-xs font-medium capitalize transition-colors ${activeTab === tab ? "border-b-2 border-[#F5C742] text-gray-900" : "text-gray-500 hover:text-gray-800"}`}
                            >
                                {tab === "setup" ? "Cheque Setup" : "Fields"}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {activeTab === "setup" && (
                            <div className="p-4 space-y-5">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Cheque Size</label>
                                    <div className="space-y-1.5">
                                        {Object.entries(SIZE_PRESETS).map(([key, preset]) => (
                                            <button
                                                key={key}
                                                onClick={() => handleSizePreset(key)}
                                                className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${settings.sizePreset === key ? "border-[#F5C742] bg-[#F5C742]/10 text-gray-900 font-medium" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Width (mm)</label>
                                            <input
                                                type="number"
                                                value={settings.widthMm}
                                                onChange={e => set({ sizePreset: "custom", widthMm: +e.target.value })}
                                                className="w-full text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#F5C742]"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Height (mm)</label>
                                            <input
                                                type="number"
                                                value={settings.heightMm}
                                                onChange={e => set({ sizePreset: "custom", heightMm: +e.target.value })}
                                                className="w-full text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#F5C742]"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Cheque Background</label>
                                    <p className="text-xs text-gray-500 mb-3 leading-relaxed">Upload a scan or photo of your blank cheque as the background. Fields will overlay on top for precise positioning.</p>

                                    {settings.backgroundImageUrl ? (
                                        <div className="relative">
                                            <img
                                                src={settings.backgroundImageUrl}
                                                alt="Cheque background"
                                                className="w-full rounded-lg border object-cover"
                                                style={{ height: 80 }}
                                            />
                                            <button
                                                onClick={() => set({ backgroundImageUrl: "" })}
                                                className="absolute top-1.5 right-1.5 p-1 bg-red-500 hover:bg-red-600 rounded text-white"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="w-full border-2 border-dashed border-gray-300 hover:border-[#F5C742] rounded-lg py-6 flex flex-col items-center gap-2 transition-colors group"
                                        >
                                            <ImageIcon className="w-6 h-6 text-gray-400 group-hover:text-[#F5C742]" />
                                            <span className="text-xs text-gray-500 group-hover:text-gray-700">Click to upload cheque image</span>
                                            <span className="text-xs text-gray-400">PNG, JPG, WEBP</span>
                                        </button>
                                    )}
                                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Display Options</label>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-gray-600">Show Grid</span>
                                            <Toggle checked={settings.showGrid} onChange={v => set({ showGrid: v })} />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-gray-600">Show Ruler</span>
                                            <Toggle checked={settings.showRuler} onChange={v => set({ showRuler: v })} />
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => { setSettings(s => ({ ...s, fields: DEFAULT_FIELDS.map(f => ({ ...f })) })); toast.success("Fields reset to defaults"); }}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    Reset Field Positions
                                </button>
                            </div>
                        )}

                        {activeTab === "fields" && (
                            <div className="p-3 space-y-2">
                                <p className="text-xs text-gray-400 px-1 mb-3">Click a field to select it on the canvas, or expand to edit its properties.</p>
                                {settings.fields.map(field => {
                                    const expanded = expandedFields.has(field.id);
                                    const isSelected = selectedFieldId === field.id;
                                    return (
                                        <div
                                            key={field.id}
                                            className={`border rounded-lg overflow-hidden transition-all ${isSelected ? "border-[#F5C742] shadow-sm" : "border-gray-200"}`}
                                        >
                                            <div
                                                className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${isSelected ? "bg-[#F5C742]/10" : "hover:bg-gray-50"}`}
                                                onClick={() => { setSelectedFieldId(isSelected ? null : field.id); if (!expanded) toggleExpand(field.id); }}
                                            >
                                                <Toggle checked={field.enabled} onChange={v => setField(field.id, { enabled: v })} />
                                                <span className={`flex-1 text-xs font-medium truncate ${field.enabled ? "text-gray-800" : "text-gray-400"}`}>
                                                    {field.label}
                                                </span>
                                                <button
                                                    onClick={e => { e.stopPropagation(); setField(field.id, { locked: !field.locked }); }}
                                                    className="p-0.5 hover:bg-gray-200 rounded"
                                                    title={field.locked ? "Unlock" : "Lock position"}
                                                >
                                                    {field.locked ? <Lock className="w-3 h-3 text-amber-500" /> : <Unlock className="w-3 h-3 text-gray-400" />}
                                                </button>
                                                <button
                                                    onClick={e => { e.stopPropagation(); toggleExpand(field.id); }}
                                                    className="p-0.5 hover:bg-gray-200 rounded"
                                                >
                                                    <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`} />
                                                </button>
                                            </div>

                                            {expanded && (
                                                <div className="px-3 py-3 border-t bg-gray-50 space-y-3">
                                                    <div>
                                                        <label className="block text-xs text-gray-500 mb-1">Preview Value</label>
                                                        <input
                                                            type="text"
                                                            value={field.sampleValue}
                                                            onChange={e => setField(field.id, { sampleValue: e.target.value })}
                                                            className="w-full text-xs border rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#F5C742]"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs text-gray-500 mb-1">Position (% from top-left)</label>
                                                        <div className="grid grid-cols-3 gap-1.5">
                                                            {[["X %", "x"], ["Y %", "y"], ["Width %", "width"]].map(([lbl, key]) => (
                                                                <div key={key}>
                                                                    <label className="block text-xs text-gray-400 mb-0.5">{lbl}</label>
                                                                    <input
                                                                        type="number"
                                                                        step="0.5"
                                                                        value={field[key]}
                                                                        onChange={e => setField(field.id, { [key]: +e.target.value })}
                                                                        className="w-full text-xs border rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#F5C742]"
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs text-gray-500 mb-1">Typography</label>
                                                        <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                                                            <div>
                                                                <label className="block text-xs text-gray-400 mb-0.5">Font Size</label>
                                                                <input type="number" value={field.fontSize}
                                                                    onChange={e => setField(field.id, { fontSize: +e.target.value })}
                                                                    className="w-full text-xs border rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#F5C742]" />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs text-gray-400 mb-0.5">Color</label>
                                                                <input type="color" value={field.color}
                                                                    onChange={e => setField(field.id, { color: e.target.value })}
                                                                    className="w-full h-7 rounded border cursor-pointer" />
                                                            </div>
                                                        </div>

                                                        <select
                                                            value={field.fontFamily}
                                                            onChange={e => setField(field.id, { fontFamily: e.target.value })}
                                                            className="w-full text-xs border rounded px-1.5 py-1.5 bg-white mb-1.5"
                                                        >
                                                            {FONT_FAMILIES.map(f => (
                                                                <option key={f} value={f}>{f.split(",")[0]}</option>
                                                            ))}
                                                        </select>

                                                        <div className="flex items-center gap-1.5">
                                                            <button
                                                                onClick={() => setField(field.id, { fontWeight: field.fontWeight === "bold" ? "normal" : "bold" })}
                                                                className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${field.fontWeight === "bold" ? "bg-gray-800 text-white border-gray-800" : "border-gray-200 text-gray-600"}`}
                                                            >
                                                                <Bold className="w-3 h-3" /> Bold
                                                            </button>
                                                            <button
                                                                onClick={() => setField(field.id, { fontStyle: field.fontStyle === "italic" ? "normal" : "italic" })}
                                                                className={`px-2 py-1 rounded text-xs border italic transition-colors ${field.fontStyle === "italic" ? "bg-gray-800 text-white border-gray-800" : "border-gray-200 text-gray-600"}`}
                                                            >
                                                                Italic
                                                            </button>
                                                            {["left", "center", "right"].map(align => (
                                                                <button
                                                                    key={align}
                                                                    onClick={() => setField(field.id, { textAlign: align })}
                                                                    className={`p-1.5 rounded border transition-colors ${field.textAlign === align ? "bg-[#F5C742] border-[#F5C742]" : "border-gray-200 text-gray-600"}`}
                                                                >
                                                                    <FieldAlignIcon align={align} />
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Canvas Area */}
                <div className="flex-1 bg-gray-200 overflow-auto flex flex-col">
                    {settings.showRuler && (
                        <div className="flex-shrink-0 bg-white border-b border-gray-300 overflow-hidden" style={{ height: 20, marginLeft: 20 }}>
                            <div style={{ width: scaledW, position: "relative", height: "100%" }}>
                                {Array.from({ length: Math.ceil(settings.widthMm / 10) + 1 }).map((_, i) => (
                                    <div key={i} style={{ position: "absolute", left: i * 10 * PX_PER_MM * (zoom / 100), top: 0, height: "100%", borderLeft: "1px solid #d1d5db", display: "flex", alignItems: "flex-end", paddingBottom: 1 }}>
                                        <span style={{ fontSize: 8, color: "#9ca3af", paddingLeft: 2 }}>{i * 10}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-auto p-8">
                        <div className="flex justify-center items-start min-h-full">
                            <div className="flex-shrink-0" style={{ width: settings.showRuler ? 20 : 0 }}>
                                {settings.showRuler && (
                                    <div style={{ width: 20, height: scaledH, position: "relative", background: "white", borderRight: "1px solid #d1d5db" }}>
                                        {Array.from({ length: Math.ceil(settings.heightMm / 10) + 1 }).map((_, i) => (
                                            <div key={i} style={{ position: "absolute", top: i * 10 * PX_PER_MM * (zoom / 100), left: 0, width: "100%", borderTop: "1px solid #d1d5db" }}>
                                                <span style={{ fontSize: 8, color: "#9ca3af", writingMode: "vertical-rl", transform: "rotate(180deg)", display: "inline-block", lineHeight: 1 }}>{i * 10}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div style={{ position: "relative", flexShrink: 0 }}>
                                <div
                                    ref={canvasRef}
                                    style={{
                                        width: scaledW, height: scaledH, position: "relative", overflow: "hidden",
                                        boxShadow: "0 4px 32px rgba(0,0,0,0.22), 0 1px 4px rgba(0,0,0,0.10)",
                                        cursor: showPreviewMode ? "default" : "crosshair",
                                        borderRadius: 4,
                                        background: settings.backgroundImageUrl ? "transparent" : "#fffef5",
                                    }}
                                    onClick={e => { if (e.target === canvasRef.current) setSelectedFieldId(null); }}
                                >
                                    {settings.backgroundImageUrl && (
                                        <img src={settings.backgroundImageUrl} alt=""
                                            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", display: "block" }}
                                            draggable={false} />
                                    )}

                                    {!settings.backgroundImageUrl && (
                                        <div style={{ position: "absolute", inset: 0, border: "2px solid #1e3a5f", borderRadius: 4 }}>
                                            <div style={{ position: "absolute", top: 6, left: 12, fontSize: 11, fontWeight: 700, color: "#1e3a5f99", fontFamily: "Arial, sans-serif" }}>
                                                Bank Name — Branch
                                            </div>
                                            <div style={{ position: "absolute", bottom: 8, left: 12, right: 12, borderTop: "1px dashed #1e3a5f44", paddingTop: 4, fontSize: 9, fontFamily: "monospace", color: "#1e3a5f55", letterSpacing: 2 }}>
                                                ⑆ 0000 ⑆ 000000 ⑆ 000 ⑈
                                            </div>
                                            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, opacity: 0.35 }}>
                                                <ImageIcon style={{ width: 24, height: 24, color: "#1e3a5f" }} />
                                                <span style={{ fontSize: 10, color: "#1e3a5f", textAlign: "center" }}>Upload cheque image in Setup tab</span>
                                            </div>
                                        </div>
                                    )}

                                    {settings.showGrid && !showPreviewMode && (
                                        <div
                                            style={{
                                                position: "absolute", inset: 0,
                                                backgroundImage: `
                                                    linear-gradient(to right, rgba(99,102,241,0.08) 1px, transparent 1px),
                                                    linear-gradient(to bottom, rgba(99,102,241,0.08) 1px, transparent 1px)
                                                `,
                                                backgroundSize: `${10 * PX_PER_MM * (zoom / 100)}px ${10 * PX_PER_MM * (zoom / 100)}px`,
                                                pointerEvents: "none",
                                            }}
                                        />
                                    )}

                                    {settings.fields.filter(f => f.enabled).map(field => {
                                        const isSelected = selectedFieldId === field.id;
                                        const fieldPxW = (field.width / 100) * scaledW;
                                        const fieldPxX = (field.x / 100) * scaledW;
                                        const fieldPxY = (field.y / 100) * scaledH;
                                        const scaledFontSize = field.fontSize * (zoom / 100);

                                        return (
                                            <div
                                                key={field.id}
                                                onMouseDown={e => handleFieldMouseDown(e, field.id)}
                                                style={{
                                                    position: "absolute",
                                                    left: fieldPxX, top: fieldPxY, width: fieldPxW,
                                                    cursor: field.locked ? "not-allowed" : showPreviewMode ? "default" : "move",
                                                    userSelect: "none",
                                                    zIndex: isSelected ? 10 : 5,
                                                }}
                                            >
                                                {isSelected && !showPreviewMode && (
                                                    <div style={{
                                                        position: "absolute", inset: -3,
                                                        border: "1.5px dashed #F5C742", borderRadius: 2,
                                                        pointerEvents: "none", background: "rgba(245,199,66,0.05)",
                                                    }}>
                                                        <div style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)", background: "#F5C742", color: "#1a1a2e", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, whiteSpace: "nowrap" }}>
                                                            {field.label}
                                                        </div>
                                                        <div style={{ position: "absolute", bottom: -4, right: -4, width: 8, height: 8, background: "#F5C742", borderRadius: "50%" }} />
                                                    </div>
                                                )}

                                                <div
                                                    style={{
                                                        fontFamily: field.fontFamily,
                                                        fontSize: scaledFontSize,
                                                        fontWeight: field.fontWeight,
                                                        fontStyle: field.fontStyle,
                                                        color: field.color,
                                                        textAlign: field.textAlign,
                                                        lineHeight: 1.3,
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        ...(!showPreviewMode && !isSelected ? { textDecoration: "underline", textDecorationStyle: "dotted", textDecorationColor: "rgba(99,102,241,0.4)" } : {}),
                                                    }}
                                                >
                                                    {field.sampleValue}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="text-center mt-2 text-xs text-gray-400">
                                    {settings.widthMm} × {settings.heightMm} mm · {Math.round(scaledW)} × {Math.round(scaledH)} px at {zoom}%
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Quick-Edit Panel */}
                {selectedField && !showPreviewMode && (
                    <div className="w-60 bg-white border-l flex-shrink-0 overflow-y-auto">
                        <div className="px-4 py-3 border-b bg-[#F5C742]/10 flex items-center justify-between">
                            <div>
                                <div className="text-xs font-semibold text-gray-800">{selectedField.label}</div>
                                <div className="text-xs text-gray-500">Quick Edit</div>
                            </div>
                            <button onClick={() => setSelectedFieldId(null)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
                        </div>

                        <div className="p-4 space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-2">Position</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[["X %", "x"], ["Y %", "y"], ["Width %", "width"]].map(([lbl, key]) => (
                                        <div key={key}>
                                            <label className="block text-xs text-gray-400 mb-0.5">{lbl}</label>
                                            <input
                                                type="number" step="0.5"
                                                value={selectedField[key]}
                                                onChange={e => setField(selectedField.id, { [key]: +e.target.value })}
                                                className="w-full text-xs border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-[#F5C742]"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-2">Typography</label>
                                <div className="flex gap-2 mb-2">
                                    <div className="flex-1">
                                        <label className="block text-xs text-gray-400 mb-0.5">Size</label>
                                        <input type="number" value={selectedField.fontSize}
                                            onChange={e => setField(selectedField.id, { fontSize: +e.target.value })}
                                            className="w-full text-xs border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-[#F5C742]" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-0.5">Color</label>
                                        <input type="color" value={selectedField.color}
                                            onChange={e => setField(selectedField.id, { color: e.target.value })}
                                            className="w-10 h-7 rounded border cursor-pointer" />
                                    </div>
                                </div>

                                <select
                                    value={selectedField.fontFamily}
                                    onChange={e => setField(selectedField.id, { fontFamily: e.target.value })}
                                    className="w-full text-xs border rounded px-2 py-1.5 mb-2"
                                >
                                    {FONT_FAMILIES.slice(0, 6).map(f => (
                                        <option key={f} value={f}>{f.split(",")[0]}</option>
                                    ))}
                                </select>

                                <div className="flex gap-1.5">
                                    <button
                                        onClick={() => setField(selectedField.id, { fontWeight: selectedField.fontWeight === "bold" ? "normal" : "bold" })}
                                        className={`flex-1 py-1 text-xs rounded border font-bold transition-colors ${selectedField.fontWeight === "bold" ? "bg-gray-800 text-white border-gray-800" : "border-gray-200 text-gray-600"}`}
                                    >B</button>
                                    <button
                                        onClick={() => setField(selectedField.id, { fontStyle: selectedField.fontStyle === "italic" ? "normal" : "italic" })}
                                        className={`flex-1 py-1 text-xs rounded border italic transition-colors ${selectedField.fontStyle === "italic" ? "bg-gray-800 text-white border-gray-800" : "border-gray-200 text-gray-600"}`}
                                    >I</button>
                                    {["left", "center", "right"].map(align => (
                                        <button
                                            key={align}
                                            onClick={() => setField(selectedField.id, { textAlign: align })}
                                            className={`flex-1 p-1 rounded border flex items-center justify-center transition-colors ${selectedField.textAlign === align ? "bg-[#F5C742] border-[#F5C742]" : "border-gray-200 text-gray-600"}`}
                                        >
                                            <FieldAlignIcon align={align} />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">Lock Position</span>
                                <Toggle checked={selectedField.locked} onChange={v => setField(selectedField.id, { locked: v })} />
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">Visible</span>
                                <Toggle checked={selectedField.enabled} onChange={v => setField(selectedField.id, { enabled: v })} />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
