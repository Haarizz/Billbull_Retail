import React, { useEffect, useState } from 'react';
import { Eye, X, Download, Printer, Mail, MessageCircle, Save, CheckCircle2 } from 'lucide-react';

// "Review before committing" preview for a Sales Invoice. Shown after the user
// clicks Save Draft / Confirm and before the document is actually persisted.
//
// The body renders the SAME default print template that Print produces (via the
// parent's getHtml() → print-template engine), so the preview is WYSIWYG with
// the printed/emailed document. `mode` only frames the header badge and primary
// button; the document title (DRAFT INVOICE / TAX INVOICE) is stamped by the
// parent into the template data.
//
//   • 'Draft'     → badge "Draft"       / primary "Save as Draft"
//   • 'Confirmed' → badge "Tax Invoice" / primary "Confirm & Finalize"

// Strip any embedded auto-print / scripts so the template doesn't trigger the
// browser print dialog when rendered inside the preview iframe.
const stripScripts = (html) => String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '');

const InvoicePreviewModal = ({
    mode = 'Draft',
    invoiceNo = '',
    getHtml,
    onClose,
    onConfirm,
    onPrint,
    onEmail,
    onDownload,
    onWhatsApp,
}) => {
    const isDraft = mode !== 'Confirmed';
    const [html, setHtml] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(false);
        Promise.resolve(getHtml?.())
            .then((result) => {
                if (cancelled) return;
                if (result) setHtml(stripScripts(result));
                else setError(true);
            })
            .catch(() => { if (!cancelled) setError(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
        // Render once on mount — the modal is freshly mounted per open, so this
        // captures the form snapshot at the moment the preview was requested.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4">
            <div className="bg-[#F7F8FA] w-[760px] max-w-[96vw] max-h-[94vh] rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
                {/* Modal Header */}
                <div className="px-5 py-4 bg-white border-b border-slate-100 flex justify-between items-start">
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-[#F5C742] flex items-center justify-center text-slate-900 shrink-0">
                            <Eye size={18} />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-800">Invoice Preview</h3>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                                Review before confirming • {invoiceNo || '—'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="px-3 py-1 rounded-md border border-slate-200 text-[11px] font-bold text-slate-600 bg-white">
                            {isDraft ? 'Draft' : 'Tax Invoice'}
                        </span>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Document body (default print template) */}
                <div className="flex-1 overflow-y-auto p-5 bg-[#EEF0F3]">
                    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
                        {loading && (
                            <div className="flex items-center justify-center h-[400px] text-sm text-slate-400">
                                Rendering preview…
                            </div>
                        )}
                        {!loading && error && (
                            <div className="flex items-center justify-center h-[400px] text-sm text-slate-400">
                                Preview unavailable — no default print template found.
                            </div>
                        )}
                        {!loading && !error && (
                            <iframe
                                title="Invoice preview"
                                srcDoc={html}
                                className="w-full"
                                style={{ height: '70vh', border: 'none' }}
                            />
                        )}
                    </div>
                </div>

                {/* Footer actions */}
                <div className="px-5 py-3 bg-white border-t border-slate-100 flex justify-between items-center">
                    <button onClick={onClose} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">
                        <X size={16} /> Close
                    </button>
                    <div className="flex items-center gap-2">
                        <button onClick={onDownload} title="Download PDF" className="p-2 rounded-md hover:bg-slate-100 text-slate-500"><Download size={18} /></button>
                        <button onClick={onPrint} title="Print" className="p-2 rounded-md hover:bg-slate-100 text-slate-500"><Printer size={18} /></button>
                        <button onClick={onEmail} title="Email" className="p-2 rounded-md hover:bg-slate-100 text-slate-500"><Mail size={18} /></button>
                        <button onClick={onWhatsApp} title="WhatsApp" className="p-2 rounded-md hover:bg-slate-100 text-slate-500"><MessageCircle size={18} /></button>
                        <button
                            onClick={onConfirm}
                            className="flex items-center gap-1.5 px-4 py-2 bg-[#F5C742] text-slate-900 rounded-md text-sm font-bold hover:bg-yellow-500 shadow-sm ml-1"
                        >
                            {isDraft ? <><Save size={16} /> Save as Draft</> : <><CheckCircle2 size={16} /> Confirm &amp; Finalize</>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InvoicePreviewModal;
