import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Eye, RotateCcw, Save, ScrollText, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { resolvePrintTemplate, updateTemplateTerms } from '@billbull/shared/api/printTemplateApi';
import { usePermissions } from '@billbull/shared/context/PermissionContext';

const parseObject = (value) => {
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string' || !value.trim()) return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

// The default terms and Show Terms switch of a print template, read the same way the
// print renderer reads them (terms_content first, then the designer's own copy).
const readTemplateTerms = (template) => {
    const options = parseObject(template?.displayOptions);
    const designer = options.salesDesignerSettings || options.designerSettings || options.purchaseDesignerSettings || {};
    return {
        terms: String(template?.termsContent || designer.termsText || designer.termsConditions || ''),
        hidden: options.showTerms === false || designer.showTerms === false,
    };
};

const sameTerms = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

/**
 * Terms & Conditions for a document editor (Sales Invoice, and any other document whose print
 * template carries terms). The card shows a short preview; the eye button opens the full text in
 * a modal, where it is edited.
 *
 * - value === null/undefined: the document has no terms of its own yet. An editable document is
 *   pre-filled with the default from the category's print template, so what is saved is exactly
 *   what prints, and later edits to the template don't change documents already issued.
 * - In the modal the user can edit the text for this document only, put the default back, or
 *   save the text as the new default (writes the template's terms; needs edit permission).
 */
export default function DocumentTermsCard({
    category,
    branchId,
    value,
    onChange,
    readOnly = false,
    documentLabel = 'document',
}) {
    const { canEdit } = usePermissions();
    const canSaveDefault = canEdit('sales') || canEdit('purchases');

    const [template, setTemplate] = useState(null);
    const [loadState, setLoadState] = useState('loading'); // loading | ready | error
    const [isOpen, setIsOpen] = useState(false);
    const [draft, setDraft] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoadState('loading');
        resolvePrintTemplate(category, branchId ?? undefined)
            .then((resolved) => {
                if (cancelled) return;
                setTemplate(resolved || null);
                setLoadState('ready');
            })
            .catch(() => {
                if (!cancelled) setLoadState('error');
            });
        return () => { cancelled = true; };
    }, [category, branchId]);

    const { terms: defaultTerms, hidden: templateHidesTerms } = useMemo(() => readTemplateTerms(template), [template]);

    // Pre-fill a new (or legacy, still editable) document with the template default.
    useEffect(() => {
        if (loadState === 'ready' && value == null && !readOnly) {
            onChange(defaultTerms);
        }
    }, [loadState, value, readOnly, defaultTerms, onChange]);

    const text = value ?? (readOnly ? defaultTerms : '');
    const isEdited = loadState === 'ready' && value != null && !sameTerms(value, defaultTerms);
    const templateName = template?.name || `${category} template`;
    const canWriteTemplate = !readOnly && canSaveDefault && template?.id != null;
    const draftDiffersFromDefault = loadState === 'ready' && !sameTerms(draft, defaultTerms);

    const openModal = () => {
        setDraft(text);
        setConfirming(false);
        setIsOpen(true);
    };

    const closeModal = () => {
        if (saving) return;
        setIsOpen(false);
        setConfirming(false);
    };

    const applyDraft = () => {
        onChange(draft);
        closeModal();
    };

    useEffect(() => {
        if (!isOpen) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const handleSaveDefault = async () => {
        if (!canWriteTemplate) return;
        setSaving(true);
        try {
            const saved = await updateTemplateTerms(template.id, draft);
            setTemplate(saved || { ...template, termsContent: draft });
            // The new default is also this document's terms.
            onChange(draft);
            setConfirming(false);
            setIsOpen(false);
            toast.success(`Saved as the default terms on "${templateName}".`);
        } catch (err) {
            toast.error(err?.response?.status === 403
                ? 'You do not have permission to change print templates.'
                : 'Could not save the default terms. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const statusBadge = loadState === 'ready' && value != null && (
        isEdited
            ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#FFF8E7] text-[#B07C00] border border-[#FDE6A9]">Edited for this {documentLabel}</span>
            : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200">Default</span>
    );

    const modal = isOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={closeModal}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Terms & Conditions"
                className="bg-white w-full max-w-3xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <ScrollText size={16} className="text-[#D99A00]" /> Terms &amp; Conditions
                        {!readOnly && loadState === 'ready' && (
                            draftDiffersFromDefault
                                ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#FFF8E7] text-[#B07C00] border border-[#FDE6A9]">Edited for this {documentLabel}</span>
                                : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200">Default</span>
                        )}
                    </h3>
                    <button type="button" onClick={closeModal} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                    {readOnly ? (
                        <div className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">
                            {text || <span className="text-slate-400 italic">No terms on this {documentLabel}.</span>}
                        </div>
                    ) : (
                        <textarea
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder={`Terms & conditions for this ${documentLabel}`}
                            className="w-full h-[55vh] text-xs leading-relaxed p-3 border border-slate-200 rounded-lg resize-none focus:outline-none focus:border-[#F5C742]"
                        />
                    )}
                    <div className="mt-2 text-[10px] text-slate-400">
                        Prints on this {documentLabel} only. Default comes from Print &amp; Email Templates › {templateName}.
                    </div>
                </div>

                {confirming && (
                    <div className="mx-5 mb-3 p-2.5 rounded border border-[#FDE6A9] bg-[#FFF8E7] text-[11px] text-slate-700 flex flex-wrap items-center gap-2">
                        <span className="flex-1 min-w-50">
                            Make this the default terms on <b>{templateName}</b>? New {documentLabel}s will start with this text.
                            Saved {documentLabel}s keep the terms they already have.
                        </span>
                        <button
                            type="button"
                            onClick={() => setConfirming(false)}
                            disabled={saving}
                            className="h-7 px-2 font-semibold rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveDefault}
                            disabled={saving}
                            className="h-7 px-2 font-semibold rounded bg-[#F5C742] text-slate-900 hover:bg-[#EDB92E] disabled:opacity-50"
                        >
                            {saving ? 'Saving…' : 'Yes, save as default'}
                        </button>
                    </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50 rounded-b-xl">
                    <div className="flex items-center gap-2">
                        {!readOnly && draftDiffersFromDefault && (
                            <button
                                type="button"
                                onClick={() => setDraft(defaultTerms)}
                                className="h-8 px-3 text-xs font-semibold rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 flex items-center gap-1.5"
                                title="Replace the text with the default terms"
                            >
                                <RotateCcw size={13} /> Use default
                            </button>
                        )}
                        {canWriteTemplate && draftDiffersFromDefault && !confirming && (
                            <button
                                type="button"
                                onClick={() => setConfirming(true)}
                                className="h-8 px-3 text-xs font-semibold rounded border border-[#F5C742] bg-[#FFF8E7] text-[#8A6100] hover:bg-[#FDE6A9] flex items-center gap-1.5"
                                title={`Make this text the default on "${templateName}"`}
                            >
                                <Save size={13} /> Save as default
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={closeModal}
                            className="h-8 px-3 text-xs font-semibold rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                        >
                            {readOnly ? 'Close' : 'Cancel'}
                        </button>
                        {!readOnly && (
                            <button
                                type="button"
                                onClick={applyDraft}
                                className="h-8 px-4 text-xs font-semibold rounded bg-[#F5C742] text-slate-900 hover:bg-[#EDB92E]"
                            >
                                Apply to this {documentLabel}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );

    return (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-xs font-bold text-slate-700 flex items-center gap-2">
                    <ScrollText size={14} className="text-slate-400" /> Terms &amp; Conditions
                    {statusBadge}
                </h3>
                <button
                    type="button"
                    onClick={openModal}
                    disabled={loadState === 'loading' && value == null}
                    className="h-7 px-2 text-[11px] font-semibold rounded border border-slate-200 text-slate-600 hover:bg-[#FFF8E7] hover:border-[#FDE6A9] flex items-center gap-1.5 disabled:opacity-50"
                    title={readOnly ? 'View full terms' : 'View and edit the full terms'}
                >
                    <Eye size={13} /> {readOnly ? 'View' : 'View / Edit'}
                </button>
            </div>

            <button
                type="button"
                onClick={openModal}
                className="w-full text-left text-xs leading-relaxed text-slate-600 p-2 border border-slate-200 rounded bg-slate-50 hover:border-[#FDE6A9] whitespace-pre-line line-clamp-3"
            >
                {loadState === 'loading' && value == null
                    ? <span className="text-slate-400">Loading default terms…</span>
                    : (text || <span className="text-slate-400 italic">No terms on this {documentLabel}{readOnly ? '' : ' — click to add'}.</span>)}
            </button>

            {loadState === 'error' && (
                <div className="mt-1.5 text-[10px] text-slate-400">
                    Could not load the default terms. Left untouched, the print template&apos;s terms are printed.
                </div>
            )}
            {loadState === 'ready' && templateHidesTerms && (
                <div className="mt-1.5 text-[10px] text-amber-700 flex items-center gap-1">
                    <AlertTriangle size={11} /> The default template hides the Terms section. Turn on Show Terms in Print &amp; Email Templates to print these.
                </div>
            )}
            {modal}
        </div>
    );
}
