// QA-040: Reusable Send-Email modal for designed-template documents.
// Each module (Quotation, Sales Order, Sales Invoice, Delivery Note,
// Proforma Invoice, Receipt Voucher) needs the same shape:
//   - To / Subject / Message inputs
//   - Live preview (iframe): the message above the document, as the customer
//     will see the email plus its PDF
//   - Send button that POSTs the message as the email body and the print HTML
//     for the PDF attachment to the module's /send-email endpoint
//
// Layout: compose form on the left, live preview on the right (stacked on
// narrow screens). Esc closes, Ctrl/Cmd+Enter sends.
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
//   apiFn           : (id, { toEmail, subject, htmlBody, inlineAttachments, pdfHtml }) => Promise
//   docLabel        : human-friendly label ("Quotation", "Sales Invoice", ...)
//   buildPdfHtml    : optional async (template) => print HTML for the PDF attachment.
//                     `template` is the one the preview shows (null if none); render
//                     with it so the attachment matches the preview. Defaults to
//                     generatePrintHtmlAsync with that template + payload.
//   onSent          : optional () => void on success
//   onError         : optional (msg) => void on failure

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { AlertTriangle, AtSign, CheckCircle2, Eye, FileText, Loader2, Paperclip, RotateCcw, Send, X } from 'lucide-react';
import { getTemplatesByCategory } from '@billbull/shared/api/printTemplateApi';
import { generateEmailHtml, generatePrintHtmlAsync } from '@billbull/shared/utils/printGenerator';
import { defaultDocumentEmailMessage, emailMessageToHtml, withEmailMessage } from '@billbull/shared/utils/emailMessage';
import billBullLogo from '@billbull/shared/assets/billBullLogo.png';
import toast from 'react-hot-toast';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FIELD = 'w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500';
const FIELD_OK = 'border-slate-200 focus:border-yellow-400 focus:ring-yellow-100';
const FIELD_BAD = 'border-red-300 focus:border-red-400 focus:ring-red-100';

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
    buildPdfHtml,
    onSent,
    onError,
}) => {
    const [toEmail, setToEmail] = useState('');
    const [toEmailTouched, setToEmailTouched] = useState(false);
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    // The rendered document (without the message) or, when it cannot be rendered, a notice.
    const [docHtml, setDocHtml] = useState('');
    const [previewNotice, setPreviewNotice] = useState('');
    const [isSending, setIsSending] = useState(false);
    const companyName = companyProfile?.companyName || companyProfile?.name || '';
    const label = docLabel || category;

    const refreshPreview = useCallback(async () => {
        if (!isOpen) return;
        setDocHtml('');
        setPreviewNotice('');
        try {
            const templates = await getTemplatesByCategory(category);
            const template = templates?.find(t => t.isDefault) || templates?.[0];
            if (!template) {
                setPreviewNotice(`<div style="padding:24px;font-family:Arial;color:#888;font-size:13px;">No "${category}" template found in Settings → Print &amp; Email Templates, so the PDF attachment cannot be prepared.</div>`);
                return;
            }
            const payload = buildPayload?.() || {};
            const html = generateEmailHtml(template, payload, { companyProfile, billBullLogo });
            setDocHtml(html);
        } catch (err) {
            console.warn('Email preview render failed:', err);
            setPreviewNotice(`<div style="padding:24px;font-family:Arial;color:#c00;font-size:13px;">Preview unavailable: ${err.message || err}</div>`);
        }
    }, [isOpen, category, buildPayload, companyProfile]);

    useEffect(() => {
        if (!isOpen) return;
        setToEmail(customerEmail || '');
        setToEmailTouched(false);
        setSubject(`${docLabel || category} ${docNumber || ''} from BillBull ERP`.trim());
        refreshPreview();
    }, [isOpen, customerEmail, docNumber, docLabel, category, refreshPreview]);

    // Seeded when the dialog opens for a document, so a re-render never wipes what was typed.
    useEffect(() => {
        if (!isOpen) return;
        setMessage(defaultDocumentEmailMessage({ docLabel: docLabel || category, docNumber, companyName }));
    }, [isOpen, docNumber, docLabel, category, companyName]);

    const previewHtml = useMemo(() => {
        if (docHtml) return withEmailMessage(docHtml, message);
        if (previewNotice) return emailMessageToHtml(message) + previewNotice;
        return '';
    }, [docHtml, previewNotice, message]);

    if (!isOpen) return null;

    const handleSend = async () => {
        if (!docId) {
            toast.error(`Please save the ${label} before sending.`);
            return;
        }
        if (!toEmail || !toEmail.trim()) {
            setToEmailTouched(true);
            toast.error('Recipient email is required.');
            return;
        }
        if (!EMAIL_RE.test(toEmail.trim())) {
            setToEmailTouched(true);
            toast.error('Enter a valid recipient email address.');
            return;
        }
        setIsSending(true);

        // The sent email is the message only; the document travels as the PDF
        // attachment (the in-dialog preview still shows both). A cleared message
        // falls back to the default so the body is never empty.
        const htmlBody = emailMessageToHtml(message)
            || emailMessageToHtml(defaultDocumentEmailMessage({ docLabel: label, docNumber, companyName }));

        // The PDF attachment is rendered on the server from the PRINT HTML, using
        // the same template the preview shows. Without it the email is not sent.
        let pdfHtml = '';
        try {
            const templates = await getTemplatesByCategory(category);
            const template = templates?.find(t => t.isDefault) || templates?.[0] || null;
            if (buildPdfHtml) {
                pdfHtml = await buildPdfHtml(template);
            } else if (template) {
                pdfHtml = await generatePrintHtmlAsync(template, buildPayload?.() || {}, { companyProfile, billBullLogo });
            }
        } catch (pdfErr) {
            console.warn('PDF attachment HTML could not be built:', pdfErr);
        }
        if (!pdfHtml) {
            const msg = `Could not prepare the PDF attachment. Check that a default "${category}" print template exists in Settings → Print & Email Templates.`;
            toast.error(msg);
            onError?.(msg);
            setIsSending(false);
            return;
        }

        try {
            await apiFn(docId, { toEmail: toEmail.trim(), subject, htmlBody, inlineAttachments: [], pdfHtml });
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

    const close = () => !isSending && onClose?.();
    const resetMessage = () => setMessage(defaultDocumentEmailMessage({ docLabel: label, docNumber, companyName }));
    const onKeyDown = (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            close();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isSending) {
            e.preventDefault();
            handleSend();
        }
    };

    // The server names the file from the stored number with this same filter.
    const attachmentName = `${String(docNumber || docLabel || 'document').replace(/[^A-Za-z0-9._\- ]/g, '_')}.pdf`;
    const emailInvalid = toEmailTouched && !EMAIL_RE.test(toEmail.trim());
    const attachment = docHtml
        ? { cls: 'text-emerald-600', icon: <CheckCircle2 size={12} />, text: `Ready · default ${category} template` }
        : previewNotice
            ? { cls: 'text-red-600', icon: <AlertTriangle size={12} />, text: 'No print template, so the PDF cannot be prepared' }
            : { cls: 'text-slate-400', icon: <Loader2 size={12} className="animate-spin" />, text: 'Preparing…' };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-2 sm:p-4"
             onClick={close}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="send-document-email-title"
                className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col overflow-hidden"
                style={{ height: '92vh', maxHeight: '920px' }}
                onClick={e => e.stopPropagation()}
                onKeyDown={onKeyDown}
            >
                {/* Header */}
                <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 bg-gradient-to-r from-[#FFF8E7] to-white">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-yellow-400 flex items-center justify-center shrink-0 shadow-sm">
                            <Send size={16} className="text-slate-900" />
                        </div>
                        <div className="min-w-0">
                            <h3 id="send-document-email-title" className="text-base font-bold text-slate-800 truncate">
                                Email {label}
                            </h3>
                            <p className="text-xs text-slate-500 truncate">
                                {docNumber && <span className="font-semibold text-slate-700">{docNumber} · </span>}
                                Sent as a PDF attachment
                            </p>
                        </div>
                    </div>
                    <button onClick={close} aria-label="Close"
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                        <X size={18} />
                    </button>
                </div>

                {/* Body: compose on the left, live preview on the right */}
                <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
                    {/* Compose */}
                    <div className="lg:w-[42%] shrink-0 flex flex-col gap-4 p-5 lg:overflow-y-auto lg:border-r border-slate-200">
                        <div>
                            <label htmlFor="send-document-email-to" className="block text-xs font-semibold text-slate-600 mb-1.5">To</label>
                            <div className="relative">
                                <AtSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                <input
                                    id="send-document-email-to"
                                    type="email"
                                    value={toEmail}
                                    onChange={e => setToEmail(e.target.value)}
                                    onBlur={() => toEmail && setToEmailTouched(true)}
                                    placeholder="customer@example.com"
                                    autoFocus={!customerEmail}
                                    aria-invalid={emailInvalid || undefined}
                                    className={`${FIELD} pl-8 ${emailInvalid ? FIELD_BAD : FIELD_OK}`}
                                    disabled={isSending}
                                />
                            </div>
                            {emailInvalid ? (
                                <p className="mt-1 text-[11px] text-red-600">Enter a valid email address.</p>
                            ) : !customerEmail ? (
                                <p className="mt-1 text-[11px] text-amber-600">No email on file for this customer. Type one to send.</p>
                            ) : null}
                        </div>

                        <div>
                            <label htmlFor="send-document-email-subject" className="block text-xs font-semibold text-slate-600 mb-1.5">Subject</label>
                            <input
                                id="send-document-email-subject"
                                type="text"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                className={`${FIELD} ${FIELD_OK}`}
                                disabled={isSending}
                            />
                        </div>

                        <div className="flex flex-col flex-1 min-h-[240px]">
                            <div className="flex items-center justify-between mb-1.5">
                                <label htmlFor="send-document-email-message" className="text-xs font-semibold text-slate-600">Message</label>
                                <button type="button" onClick={resetMessage} disabled={isSending}
                                        className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50">
                                    <RotateCcw size={11} /> Reset to default
                                </button>
                            </div>
                            <textarea
                                id="send-document-email-message"
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                placeholder="Message shown above the document"
                                className={`${FIELD} ${FIELD_OK} flex-1 min-h-[220px] resize-none leading-relaxed`}
                                disabled={isSending}
                            />
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-slate-600 mb-1.5">Attachment</p>
                            <div className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 bg-slate-50">
                                <div className="w-9 h-10 rounded-md bg-red-50 border border-red-200 flex flex-col items-center justify-center shrink-0">
                                    <FileText size={14} className="text-red-500" />
                                    <span className="text-[8px] font-bold text-red-500 leading-none mt-0.5">PDF</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-slate-700 flex items-center gap-1 min-w-0">
                                        <Paperclip size={12} className="text-slate-400 shrink-0" />
                                        <span className="truncate">{attachmentName}</span>
                                    </p>
                                    <p className={`text-[11px] flex items-center gap-1 mt-0.5 ${attachment.cls}`}>
                                        {attachment.icon} {attachment.text}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="flex-1 min-w-0 min-h-[480px] lg:min-h-0 flex flex-col bg-slate-100 p-4 sm:p-5">
                        <div className="flex items-center justify-between mb-2 shrink-0">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                                <Eye size={13} /> Preview
                            </p>
                            <p className="text-[11px] text-slate-400">Your message, then the attached document</p>
                        </div>
                        <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                            {/* Mail-client style envelope */}
                            <div className="px-4 py-3 border-b border-slate-100 space-y-1.5 shrink-0">
                                <p className="text-sm font-semibold text-slate-800 truncate">{subject || '(no subject)'}</p>
                                <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
                                    <span className="w-6 h-6 rounded-full bg-yellow-400 text-slate-900 text-[11px] font-bold flex items-center justify-center shrink-0">
                                        {(companyName || 'B').trim().charAt(0).toUpperCase()}
                                    </span>
                                    <span className="truncate">
                                        <span className="font-medium text-slate-700">{companyName || 'BillBull ERP'}</span>
                                        <span className="mx-1.5 text-slate-400">to</span>
                                        <span className={toEmail ? 'text-slate-600' : 'italic text-slate-400'}>{toEmail || 'no recipient yet'}</span>
                                    </span>
                                </div>
                            </div>
                            <iframe
                                srcDoc={previewHtml || '<div style="padding:24px;font-family:Arial;color:#888;font-size:13px">Generating preview…</div>'}
                                title="Email Preview"
                                className="w-full flex-1 min-h-0 bg-white"
                                sandbox="allow-same-origin"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 bg-white">
                    <p className="hidden sm:block text-[11px] text-slate-400">
                        <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 font-sans">Ctrl</kbd>
                        {' + '}
                        <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 font-sans">Enter</kbd>
                        {' to send · '}
                        <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 font-sans">Esc</kbd>
                        {' to close'}
                    </p>
                    <div className="flex gap-2 ml-auto">
                        <button onClick={close}
                                disabled={isSending}
                                className="px-4 py-2 text-sm font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                            Cancel
                        </button>
                        <button onClick={handleSend}
                                disabled={isSending}
                                className="px-5 py-2 text-sm font-bold text-slate-900 bg-yellow-400 rounded-lg shadow-sm hover:bg-yellow-500 disabled:opacity-60 flex items-center gap-2">
                            {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            {isSending ? 'Sending…' : 'Send Email'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SendDocumentEmailModal;
