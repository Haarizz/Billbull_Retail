import React, { useState } from 'react';
import { ChevronDown, Printer } from 'lucide-react';
import { getTemplateFamily } from '../../../api/printTemplateApi';

// Print-template picker for the Transaction Preview.
//
// Two groups, because these are genuinely two different pipelines and pretending
// otherwise would break one of them:
//   • Paper    — real PrintTemplate records (A4 / Letterhead / Pre-printed), rendered
//                as HTML by the existing print engine. Discriminated by templateType.
//   • Thermal  — 58mm / 80mm are NOT template records; they're a paper-size argument
//                into the ESC/POS byte builder, printed via a configured receipt
//                printer. Disabled (with a reason) when no printer resolves, rather
//                than failing after the click.
const PAPER_GROUPS = [
    ['FULL', 'A4 / Standard'],
    ['LETTERHEAD', 'Letterhead'],
    ['PREPRINTED', 'Preprint form'],
];

// Mirrors isOverlayInvoiceTemplate in SalesInvoice.jsx — a template is an overlay
// (pre-printed) when its type says so or its designer settings use the overlay mode.
const resolveTemplateType = (tpl) => {
    const type = String(tpl.templateType || '').toUpperCase();
    if (['FULL', 'LETTERHEAD', 'PREPRINTED'].includes(type)) return type;
    try {
        const opts = typeof tpl.displayOptions === 'string'
            ? JSON.parse(tpl.displayOptions)
            : (tpl.displayOptions || {});
        if (opts.salesDesigner === 'overlay' || opts?.salesDesignerSettings?.mode === 'preprinted') {
            return 'LETTERHEAD';
        }
    } catch {
        /* fall through to FULL */
    }
    return 'FULL';
};

export default function PrintTemplateMenu({
    invoice,
    disabled = false,
    onPrintPaper,
    onPrintThermal,
    thermalDisabledReason = '',
}) {
    const [open, setOpen] = useState(false);
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(false);

    // Lazily load the template family the first time the menu opens. Driven from the
    // click rather than an effect: opening the menu is the user action that needs the
    // data, so there's no state to synchronise on render.
    const toggleMenu = async () => {
        const next = !open;
        setOpen(next);
        if (!next || templates.length > 0 || loading) return;
        setLoading(true);
        try {
            const family = await getTemplateFamily('Sales Invoice');
            if (Array.isArray(family)) setTemplates(family);
        } catch {
            /* one-click default print still works without the family */
        } finally {
            setLoading(false);
        }
    };

    const thermalBlocked = Boolean(thermalDisabledReason);

    return (
        <div className="relative inline-block">
            <button
                type="button"
                disabled={disabled}
                aria-expanded={open}
                aria-haspopup="menu"
                onClick={toggleMenu}
                className="h-8 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-xs font-medium disabled:opacity-50"
            >
                <Printer size={13} /> Print Template <ChevronDown size={13} className="text-slate-400" />
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div role="menu" className="absolute right-0 mt-1 w-64 max-h-80 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1">
                        <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Paper</div>
                        {loading && <div className="px-3 py-2 text-xs text-slate-400">Loading templates…</div>}
                        {!loading && templates.length === 0 && (
                            <div className="px-3 py-2 text-xs text-slate-400">No templates configured.</div>
                        )}
                        {!loading && PAPER_GROUPS.map(([groupKey, groupLabel]) => {
                            const group = templates
                                .filter((t) => resolveTemplateType(t) === groupKey)
                                .sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
                            if (group.length === 0) return null;
                            return (
                                <div key={groupKey} className="py-0.5">
                                    <div className="px-3 pt-1.5 pb-1 text-[9px] font-bold text-[#D99A00] uppercase tracking-wide">{groupLabel}</div>
                                    {group.map((t) => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            role="menuitem"
                                            title={t.name}
                                            onClick={() => { setOpen(false); onPrintPaper?.(invoice, t); }}
                                            className="w-full text-left px-3 py-2 text-xs hover:bg-[#FFF8E7] flex items-center gap-2"
                                        >
                                            {t.isDefault
                                                ? <span className="text-[#F5C742] shrink-0">★</span>
                                                : <span className="w-2.5 shrink-0" />}
                                            <span className="truncate text-slate-700">{t.name}</span>
                                        </button>
                                    ))}
                                </div>
                            );
                        })}

                        <div className="border-t border-slate-100 mt-1 pt-1">
                            <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Thermal</div>
                            {['58mm', '80mm'].map((size) => (
                                <button
                                    key={size}
                                    type="button"
                                    role="menuitem"
                                    disabled={thermalBlocked}
                                    title={thermalBlocked ? thermalDisabledReason : `Print ${size} receipt`}
                                    onClick={() => { setOpen(false); onPrintThermal?.(invoice, size); }}
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-[#FFF8E7] flex items-center gap-2 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                                >
                                    <span className="w-2.5 shrink-0" />
                                    <span className="truncate text-slate-700">Thermal {size}</span>
                                </button>
                            ))}
                            {thermalBlocked && (
                                <p className="px-3 py-1.5 text-[10px] text-slate-400 leading-snug">{thermalDisabledReason}</p>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
