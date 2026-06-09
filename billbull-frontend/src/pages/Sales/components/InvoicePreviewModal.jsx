import React, { useCallback, useEffect, useRef, useState } from 'react';
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

// The print template sets html/body/.document-shell to a fixed paper size (e.g. 210mm × 297mm
// for A4). These rules sit outside @media print so they apply on screen too, making the iframe
// content as tall as a full page even when the invoice is short — leaving a large blank gap.
//
// Strategy: strip the paper-dimension rules from the generated <style> block using regex, then
// inject a small normalisation style so the shell shrinks to its natural content height.
const preparePreviewHtml = (html) => {
    // The print template is built for physical paper (A4 = 210×297mm).
    // Three things conspire to create the blank gap in the modal:
    //
    //  1. html + body get  min-height:297mm  → the page is always a full A4 tall.
    //  2. .document-shell  gets  min-height:297mm  → same.
    //  3. .document-footer-group has  margin-top:auto  inside a flex-column shell
    //     → it floats to the *bottom* of that 297mm container.
    //  4. #footer-push-spacer is sized by an inline script to push the footer down.
    //
    // Strategy: directly mutate the generated <style> text — replace the exact
    // property values the renderer injects — then hide the spacer divs.
    // We do NOT use !important overrides (they failed because the specificity of
    // the renderer's own rules won out in some browsers); we replace at source.

    let out = html;

    // ── 1. Null-out the paper-size block that the renderer injects ──────────
    // Exact template from buildPrintStyles (line ~2684):
    //   html,\n        body {\n            width: Xmm;\n            min-height: Ymm;\n        }
    // Replace min-height with 0 and width with 100%.
    out = out.replace(
        /(html\s*,\s*\n?\s*body\s*\{[^}]*?)(width\s*:\s*[\d.]+mm)/g,
        '$1width: 100%'
    );
    out = out.replace(
        /(html\s*,\s*\n?\s*body\s*\{[^}]*?)(min-height\s*:\s*[\d.]+mm)/g,
        '$1min-height: 0'
    );

    // ── 2. Null-out .document-shell paper dimensions ─────────────────────────
    // The renderer overwrites .document-shell with width:Xmm + min-height:Ymm.
    // We target only the print-styles block (it always has both on adjacent lines).
    out = out.replace(
        /(\s\.document-shell\s*\{[^}]*?)(width\s*:\s*[\d.]+mm)/g,
        '$1width: 100%'
    );
    out = out.replace(
        /(\s\.document-shell\s*\{[^}]*?)(min-height\s*:\s*[\d.]+mm)/g,
        '$1min-height: 0'
    );

    // ── 3. Kill margin-top:auto on footer-group so it doesn't float down ─────
    out = out.replace(
        /(\s\.document-footer-group\s*\{[^}]*?)(margin-top\s*:\s*auto)/g,
        '$1margin-top: 16px'
    );

    // ── 4. For overlay templates: remove fixed height from .ov-page ──────────
    out = out.replace(
        /(\s\.ov-page\s*\{[^}]*?)(height\s*:\s*[\d.]+mm)/g,
        '$1height: auto'
    );

    // ── 5. Inject minimal reset + overlay page sizer ─────────────────────────
    const injection = `<style id="__preview_reset__">
html, body { min-height: 0 !important; height: auto !important; background: #fff !important; }
.document-shell { min-height: 0 !important; height: auto !important; }
.document-footer-group { margin-top: 16px !important; }
.content-stack { flex: none !important; }
#footer-push-spacer, #footer-inner-spacer { display: none !important; height: 0 !important; }
.ov-page { height: auto !important; overflow: visible !important; }
</style>
<script id="__preview_ov_sizer__">
(function () {
    function sizeOvPages() {
        document.querySelectorAll('.ov-page').forEach(function (page) {
            var base = page.getBoundingClientRect().top;
            var max = 0;
            page.querySelectorAll('*').forEach(function (el) {
                var pos = window.getComputedStyle(el).position;
                if (pos === 'absolute' || pos === 'fixed') {
                    var b = el.getBoundingClientRect().bottom - base;
                    if (b > max) max = b;
                }
            });
            if (max > 0) page.style.height = (max + 16) + 'px';
        });
    }
    window.addEventListener('load', sizeOvPages);
}());
</script>`;

    return out.replace(/<\/head>/i, injection + '</head>');
};

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
    const [iframeHeight, setIframeHeight] = useState('70vh');
    const iframeRef = useRef(null);

    const syncIframeHeight = useCallback(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;
        try {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!doc) return;
            const h = doc.documentElement.scrollHeight || doc.body.scrollHeight;
            if (h > 0) setIframeHeight(`${h + 8}px`);
        } catch {
            // cross-origin guard — keep existing height
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(false);
        Promise.resolve(getHtml?.())
            .then((result) => {
                if (cancelled) return;
                if (result) setHtml(preparePreviewHtml(stripScripts(result)));
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
                    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                        {loading && (
                            <div className="flex items-center justify-center h-64 text-sm text-slate-400">
                                Rendering preview…
                            </div>
                        )}
                        {!loading && error && (
                            <div className="flex items-center justify-center h-64 text-sm text-slate-400">
                                Preview unavailable — no default print template found.
                            </div>
                        )}
                        {!loading && !error && (
                            <iframe
                                ref={iframeRef}
                                title="Invoice preview"
                                srcDoc={html}
                                className="w-full"
                                style={{ height: iframeHeight, border: 'none', display: 'block' }}
                                onLoad={syncIframeHeight}
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
