import React, { useEffect, useState } from 'react';
import { MessageCircle, X, FileText, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import {
    getWhatsAppStatus,
    getWhatsAppMessages,
    normalizeWhatsAppPhone,
    sendDocumentWhatsApp,
} from '../../api/whatsappApi';
import { downloadPdfViaServer } from '../../utils/printGenerator';

// Shared "send this document on WhatsApp" flow for Quotation / Sales Order / Sales Invoice.
//
// With the WhatsApp Business API enabled (Settings → WhatsApp Settings) and a template set
// for the document type, opens a dialog that sends the PDF as a real attachment. Otherwise
// it falls back to downloading the PDF and opening the wa.me chat for a manual attach —
// wa.me links cannot carry files.
//
// Usage:
//   const { openWhatsApp, whatsAppElement } = useWhatsAppDocumentSend();
//   openWhatsApp({ documentType: 'SALES_INVOICE', documentId, documentNo, customerName,
//                  phone, amountText, dateText, buildHtml: async () => html });
//   ...render {whatsAppElement} once in the page.
// buildHtml runs when the user clicks Send (or immediately in the fallback), so pages whose
// print data comes from editor state should pass a function that reads the latest state.

const LABELS = {
    QUOTATION: 'quotation',
    SALES_ORDER: 'sales order',
    SALES_INVOICE: 'invoice',
};

// Mirrors the approved template wording in docs/whatsapp-business-api-integration-2026-10-01.md.
export const buildWhatsAppMessage = ({ documentType, customerName, documentNo, amountText, dateText }) => {
    const name = customerName || 'Customer';
    const amount = amountText ? ` for ${amountText}` : '';
    switch (documentType) {
        case 'SALES_ORDER':
            return `Dear ${name}, thank you for your order. Please find attached sales order ${documentNo}${amount}${dateText ? `, expected delivery ${dateText}` : ''}.`;
        case 'SALES_INVOICE':
            return `Dear ${name}, please find attached invoice ${documentNo}${amount}${dateText ? `, due on ${dateText}` : ''}.`;
        default:
            return `Dear ${name}, please find attached quotation ${documentNo}${amount}${dateText ? `, valid until ${dateText}` : ''}.`;
    }
};

// Status is cached briefly so a list of rows doesn't refetch on every click, but a change
// in WhatsApp Settings is picked up within a minute.
let statusCache = { at: 0, value: null };
const loadStatus = async () => {
    if (statusCache.value && Date.now() - statusCache.at < 60_000) return statusCache.value;
    try {
        const value = (await getWhatsAppStatus()).data;
        statusCache = { at: Date.now(), value };
        return value;
    } catch {
        return { enabled: false, defaultCountryCode: '971', templates: {} };
    }
};

const STATUS_TONE = {
    ACCEPTED: 'bg-slate-100 text-slate-600',
    SENT: 'bg-slate-100 text-slate-700',
    DELIVERED: 'bg-blue-50 text-blue-700',
    READ: 'bg-emerald-50 text-emerald-700',
    FAILED: 'bg-red-50 text-red-600',
};

export function useWhatsAppDocumentSend() {
    const [dialog, setDialog] = useState(null);
    const [toast, setToast] = useState(null);

    // Warm the status cache so a click can decide API vs. fallback without waiting.
    useEffect(() => { loadStatus(); }, []);

    const notify = (message, type = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 6000);
    };

    const openWhatsApp = async (doc) => {
        const status = await loadStatus();
        const apiReady = status.enabled && status.templates?.[doc.documentType] && doc.documentId;

        if (apiReady) {
            setDialog({ doc, status, phone: doc.phone || '', sending: false, error: '', history: [] });
            getWhatsAppMessages(doc.documentType, doc.documentId)
                .then(res => setDialog(d => (d && d.doc.documentId === doc.documentId ? { ...d, history: res.data || [] } : d)))
                .catch(() => { /* history is optional */ });
            return;
        }

        // Fallback: open the chat first (while the click still counts as a user gesture, so
        // popup blockers allow it), then download the PDF for a manual attach. Yield before
        // buildHtml so a page that just loaded the document into editor state has re-rendered.
        const phone = normalizeWhatsAppPhone(doc.phone, status.defaultCountryCode);
        const text = encodeURIComponent(buildWhatsAppMessage(doc));
        window.open(phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`, '_blank');
        await new Promise(r => setTimeout(r, 50));
        try {
            const html = await doc.buildHtml();
            if (html) await downloadPdfViaServer(html, doc.documentNo || 'Document');
        } catch { /* the chat is already open; the user can still use Download PDF */ }
        notify(
            `PDF downloaded — attach it in the WhatsApp chat.${phone ? '' : ' No valid customer number was found, so choose the chat in WhatsApp.'}`
            + (status.enabled ? '' : ' Enable WhatsApp Business API in Settings to attach automatically.'),
            'info'
        );
    };

    const handleSend = async () => {
        const d = dialog;
        if (!d) return;
        const toPhone = normalizeWhatsAppPhone(d.phone, d.status.defaultCountryCode);
        if (!toPhone) {
            setDialog({ ...d, error: 'Enter a valid number with country code, e.g. +971 50 123 4567.' });
            return;
        }
        setDialog({ ...d, sending: true, error: '' });
        try {
            const html = await d.doc.buildHtml();
            if (!html) throw new Error(`No default print template is set for this ${LABELS[d.doc.documentType] || 'document'}. Set one in Print & Email Templates.`);
            await sendDocumentWhatsApp(d.doc.documentType, d.doc.documentId, { toPhone: `+${toPhone}`, html });
            setDialog(null);
            notify(`${d.doc.documentNo} sent on WhatsApp to +${toPhone}.`, 'success');
        } catch (err) {
            setDialog(cur => (cur ? { ...cur, sending: false, error: err?.message || 'Failed to send on WhatsApp.' } : cur));
        }
    };

    const close = () => setDialog(d => (d?.sending ? d : null));

    const whatsAppElement = (
        <>
            {dialog && (
                <WhatsAppSendDialog
                    dialog={dialog}
                    onPhoneChange={(phone) => setDialog(d => ({ ...d, phone, error: '' }))}
                    onSend={handleSend}
                    onClose={close}
                />
            )}
            {toast && (
                <div className={`fixed right-5 top-5 z-[130] flex max-w-md items-start gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg border ${
                    toast.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-sky-200 bg-sky-50 text-sky-800'
                }`}>
                    {toast.type === 'success' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <Info size={16} className="mt-0.5 shrink-0" />}
                    <span>{toast.message}</span>
                    <button onClick={() => setToast(null)} className="ml-1 text-current opacity-60 hover:opacity-100"><X size={14} /></button>
                </div>
            )}
        </>
    );

    return { openWhatsApp, whatsAppElement };
}

function WhatsAppSendDialog({ dialog, onPhoneChange, onSend, onClose }) {
    const { doc, status, phone, sending, error, history } = dialog;
    const normalized = normalizeWhatsAppPhone(phone, status.defaultCountryCode);

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <MessageCircle size={18} className="text-emerald-600" />
                        <h3 className="font-bold text-slate-800 text-base">Send on WhatsApp</h3>
                    </div>
                    <button onClick={onClose} disabled={sending}>
                        <X size={18} className="text-slate-400 hover:text-slate-600" />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-4 overflow-y-auto">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Customer WhatsApp number</label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={e => onPhoneChange(e.target.value)}
                            placeholder="+971 50 123 4567"
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                            disabled={sending}
                            autoFocus={!phone}
                        />
                        <p className={`mt-1 text-xs ${normalized ? 'text-slate-400' : 'text-amber-600'}`}>
                            {normalized ? `Will send to +${normalized}` : 'Enter the number with country code.'}
                        </p>
                    </div>

                    <div className="rounded-lg border border-emerald-100 bg-[#ECF8F1] p-3 text-sm text-slate-700 space-y-2">
                        <div className="flex items-center gap-2 rounded-md bg-white border border-slate-200 px-2.5 py-2">
                            <FileText size={16} className="text-red-500 shrink-0" />
                            <span className="truncate font-medium">{doc.documentNo}.pdf</span>
                        </div>
                        <p>{buildWhatsAppMessage(doc)}</p>
                        <p className="text-[11px] text-slate-400">Preview — the exact wording comes from the approved WhatsApp template.</p>
                    </div>

                    {history.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-slate-500 mb-1.5">Previous sends</p>
                            <div className="space-y-1">
                                {history.slice(0, 5).map(h => (
                                    <div key={h.id} className="flex items-center justify-between gap-2 text-xs" title={h.errorMessage || ''}>
                                        <span className="text-slate-600">+{h.toPhone} · {h.createdAt ? new Date(h.createdAt).toLocaleString() : ''}</span>
                                        <span className={`px-2 py-0.5 rounded-full font-semibold ${STATUS_TONE[h.status] || STATUS_TONE.SENT}`}>{h.status}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100">
                    <button onClick={onClose} disabled={sending} className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                    <button
                        onClick={onSend}
                        disabled={sending || !normalized}
                        className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 flex items-center gap-2"
                    >
                        <MessageCircle size={15} />
                        {sending ? 'Sending...' : 'Send with PDF'}
                    </button>
                </div>
            </div>
        </div>
    );
}
