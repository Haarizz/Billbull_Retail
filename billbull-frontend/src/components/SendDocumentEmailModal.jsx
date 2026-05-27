// QA-040: Reusable Send-Email modal for designed-template documents.
// Each module (Quotation, Sales Order, Sales Invoice, Delivery Note,
// Proforma Invoice, Receipt Voucher) needs the same shape:
//   - To / Subject inputs
//   - Live email preview (iframe) using the same template as Print
//   - Send button that POSTs the rendered HTML + CID inline attachments to
//     the module's /send-email endpoint
//
// Props:
//   isOpen          : boolean
//   onClose         : () => void
//   category        : template category, e.g. 'Sales Invoice'
//   docId           : numeric id passed to apiFn
//   docNumber       : doc number for default subject ("Sales Invoice INV-0001")
//   customerEmail   : default recipient
//   buildPayload    : () => object — same payload shape as the print path
//   companyProfile  : company profile object (logo/stamp/currency)
//   apiFn           : (id, { toEmail, subject, htmlBody, inlineAttachments }) => Promise
//   docLabel        : human-friendly label ("Quotation", "Sales Invoice", ...)
//   onSent          : optional () => void on success
//   onError         : optional (msg) => void on failure

import React, { useEffect, useState, useCallback } from 'react';
import { Mail, X } from 'lucide-react';
import { getTemplatesByCategory } from '../api/printTemplateApi';
import { generateEmailHtml } from '../utils/printGenerator';
import { buildEmailBody } from '../utils/emailImageInliner';
import billBullLogo from '../assets/billBullLogo.png';
import toast from 'react-hot-toast';

const SendDocumentEmailModal = ({
    isOpen,
    onClose,
    category,
    docId,
    docNumber,
    customerEmail = '',
    buildPayload,
    companyProfile = {},
    apiFn,
    docLabel,
    onSent,
    onError,
}) => {
    const [toEmail, setToEmail] = useState('');
    const [subject, setSubject] = useState('');
    const [previewHtml, setPreviewHtml] = useState('');
    const [isSending, setIsSending] = useState(false);

    const refreshPreview = useCallback(async () => {
        if (!isOpen) return;
        setPreviewHtml('');
        try {
            const templates = await getTemplatesByCategory(category);
            const template = templates?.find(t => t.isDefault) || templates?.[0];
            if (!template) {
                setPreviewHtml(`<div style="padding:24px;font-family:Arial;color:#888;font-size:13px;">No "${category}" template found in Settings → Print &amp; Email Templates. Backend's default body will be used.</div>`);
                return;
            }
            const payload = buildPayload?.() || {};
            const html = generateEmailHtml(template, payload, { companyProfile, billBullLogo });
            setPreviewHtml(html);
        } catch (err) {
            console.warn('Email preview render failed:', err);
            setPreviewHtml(`<div style="padding:24px;font-family:Arial;color:#c00;font-size:13px;">Preview unavailable: ${err.message || err}</div>`);
        }
    }, [isOpen, category, buildPayload, companyProfile]);

    useEffect(() => {
        if (!isOpen) return;
        setToEmail(customerEmail || '');
        setSubject(`${docLabel || category} ${docNumber || ''} from BillBull ERP`.trim());
        refreshPreview();
    }, [isOpen, customerEmail, docNumber, docLabel, category, refreshPreview]);

    if (!isOpen) return null;

    const handleSend = async () => {
        if (!docId) {
            toast.error(`Please save the ${docLabel || category} before sending.`);
            return;
        }
        if (!toEmail || !toEmail.trim()) {
            toast.error('Recipient email is required.');
            return;
        }
        setIsSending(true);

        let htmlBody = '';
        let inlineAttachments = [];
        try {
            const templates = await getTemplatesByCategory(category);
            const template = templates?.find(t => t.isDefault) || templates?.[0];
            if (template) {
                const payload = buildPayload?.() || {};
                const rawHtml = generateEmailHtml(template, payload, { companyProfile, billBullLogo });
                const built = await buildEmailBody(rawHtml);
                htmlBody = built.html;
                inlineAttachments = built.inlineAttachments;
            }
        } catch (renderErr) {
            console.warn('Email body render failed; sending without templated body:', renderErr);
        }

        try {
            await apiFn(docId, { toEmail: toEmail.trim(), subject, htmlBody, inlineAttachments });
            toast.success(`Email sent to ${toEmail}`);
            onSent?.();
            onClose?.();
        } catch (err) {
            const msg = err.message || 'Failed to send email';
            toast.error(msg);
            onError?.(msg);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
             onClick={() => !isSending && onClose?.()}>
            {/* QA-040: inline style for height instead of Tailwind classes
                so the modal reliably claims a tall fixed height — preview
                iframe (flex-1 below) needs a tall parent or it collapses
                and the footer visually crowds the preview. */}
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col"
                style={{ height: '90vh', maxHeight: '900px' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <Mail size={16} className="text-yellow-500" />
                        <h3 className="text-base font-bold text-slate-800">Send {docLabel || category} Email</h3>
                    </div>
                    <button onClick={() => !isSending && onClose?.()}
                            className="p-1 rounded hover:bg-slate-100 text-slate-400">
                        <X size={16} />
                    </button>
                </div>

                <div className="px-5 py-3 space-y-3 border-b border-slate-100">
                    <div className="grid grid-cols-[80px_1fr] items-center gap-3">
                        <label className="text-xs font-semibold text-slate-600">To</label>
                        <input
                            type="email"
                            value={toEmail}
                            onChange={e => setToEmail(e.target.value)}
                            placeholder="customer@example.com"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-yellow-400"
                            disabled={isSending}
                        />
                    </div>
                    <div className="grid grid-cols-[80px_1fr] items-center gap-3">
                        <label className="text-xs font-semibold text-slate-600">Subject</label>
                        <input
                            type="text"
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-yellow-400"
                            disabled={isSending}
                        />
                    </div>
                </div>

                {/* QA-040: preview area fills remaining vertical space; the
                    iframe is constrained by its flex parent so it never
                    overlaps the modal footer regardless of viewport size. */}
                <div className="flex-1 flex flex-col px-5 py-3 min-h-0 overflow-hidden">
                    <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide shrink-0">Email Preview</p>
                    <iframe
                        srcDoc={previewHtml || '<div style="padding:24px;font-family:Arial;color:#888;font-size:13px">Generating preview…</div>'}
                        title="Email Preview"
                        className="w-full flex-1 min-h-0 rounded border border-slate-200 bg-white"
                        sandbox="allow-same-origin"
                    />
                </div>

                <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200">
                    <button onClick={() => !isSending && onClose?.()}
                            disabled={isSending}
                            className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                        Cancel
                    </button>
                    <button onClick={handleSend}
                            disabled={isSending}
                            className="px-4 py-2 text-xs font-bold text-slate-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-60 flex items-center gap-1.5">
                        <Mail size={12} /> {isSending ? 'Sending…' : 'Send Email'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SendDocumentEmailModal;
