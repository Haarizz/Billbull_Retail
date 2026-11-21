import { useEffect, useState } from 'react';
import { MessageCircle, X, FileText, AlertTriangle, CheckCircle2, Link2 } from 'lucide-react';
import { getWhatsAppMessages, sendDocumentWhatsApp } from '../../api/whatsappSendApi';
import { buildWhatsAppMessage, normalizeWhatsAppPhone } from '../../utils/whatsappLinkMessages';
import { usePosInputV2, usePosOverlay } from '../../pages/Sales/POS/input/PosOverlayContext';
import { POS_SCOPES } from '../../pages/Sales/POS/input/posScope';

// "Send with PDF" through the WhatsApp Business (Meta Cloud) API: the PDF goes to the customer
// as a real attachment from the business number, using the document type's approved template.
// Used by Retail (useWhatsAppDocumentSend) and by the POS till's Share Receipt → WhatsApp.
// Inside the till it registers as a POS overlay so typing never reaches the sale.
//
// doc: { documentType: QUOTATION | SALES_ORDER | SALES_INVOICE | POS_RECEIPT, documentId,
//        documentNo, customerName, phone, amountText?, dateText?, buildHtml: async () => html }

const LABELS = {
    QUOTATION: 'quotation',
    SALES_ORDER: 'sales order',
    SALES_INVOICE: 'invoice',
    POS_RECEIPT: 'receipt',
};

const STATUS_TONE = {
    ACCEPTED: 'bg-slate-100 text-slate-600',
    SENT: 'bg-slate-100 text-slate-700',
    DELIVERED: 'bg-blue-50 text-blue-700',
    READ: 'bg-emerald-50 text-emerald-700',
    FAILED: 'bg-red-50 text-red-600',
};

/**
 * @param status       from loadWhatsAppStatus() (defaultCountryCode)
 * @param onSent       optional (message) => void; when given it is called and the caller closes
 *                     the dialog, otherwise the dialog shows the success itself
 * @param onShareLink  optional ({ phone }) => void: switch to the link flow for this send,
 *                     carrying over the number as typed here
 * @param zClassName   stacking class; the POS completion screen needs it above its own overlays
 */
export default function WhatsAppApiSendDialog({ doc, status, onClose, onSent, onShareLink, zClassName = 'z-[120]' }) {
    const [phone, setPhone] = useState(doc.phone || '');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [history, setHistory] = useState([]);
    const [sentTo, setSentTo] = useState('');

    const label = LABELS[doc.documentType] || 'document';
    const normalized = normalizeWhatsAppPhone(phone, status?.defaultCountryCode);

    useEffect(() => {
        let alive = true;
        getWhatsAppMessages(doc.documentType, doc.documentId)
            .then(res => { if (alive) setHistory(res.data || []); })
            .catch(() => { /* history is optional */ });
        return () => { alive = false; };
    }, [doc.documentType, doc.documentId]);

    const close = () => { if (!sending) onClose(); };

    // Esc closes; in the till the POS input controller delivers it through this registration.
    const posInputV2 = usePosInputV2();
    usePosOverlay({ open: true, scope: POS_SCOPES.MODAL, onEscape: (e) => { e.preventDefault(); close(); } });
    useEffect(() => {
        if (posInputV2) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const send = async () => {
        if (!normalized) {
            setError('Enter a valid number with country code, e.g. +971 50 123 4567.');
            return;
        }
        setSending(true);
        setError('');
        try {
            const html = await doc.buildHtml();
            if (!html) throw new Error(`No default print template is set for this ${label}. Set one in Print & Email Templates.`);
            await sendDocumentWhatsApp(doc.documentType, doc.documentId, { toPhone: `+${normalized}`, html });
            const message = `${doc.documentNo} sent on WhatsApp to +${normalized}.`;
            if (onSent) {
                onSent(message);
            } else {
                setSentTo(`+${normalized}`);
                setSending(false);
            }
        } catch (err) {
            setError(err?.message || 'Failed to send on WhatsApp.');
            setSending(false);
        }
    };

    return (
        <div className={`fixed inset-0 ${zClassName} flex items-center justify-center bg-black/50 p-4`} onClick={close}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="wa-api-title"
                className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <MessageCircle size={18} className="text-emerald-600" />
                        <h3 id="wa-api-title" className="font-bold text-slate-800 text-base">Send on WhatsApp</h3>
                    </div>
                    <button onClick={close} disabled={sending} aria-label="Close">
                        <X size={18} className="text-slate-400 hover:text-slate-600" />
                    </button>
                </div>

                {sentTo ? (
                    <div className="px-5 py-8 text-center space-y-2">
                        <CheckCircle2 size={36} className="mx-auto text-emerald-600" />
                        <p className="font-semibold text-slate-800">Sent to {sentTo}</p>
                        <p className="text-sm text-slate-500">
                            The {label} PDF {doc.documentNo} is on its way from your business WhatsApp number.
                        </p>
                    </div>
                ) : (
                    <div className="px-5 py-4 space-y-4 overflow-y-auto">
                        <div>
                            <label htmlFor="wa-api-phone" className="block text-xs font-semibold text-slate-500 mb-1.5">Customer WhatsApp number</label>
                            <input
                                id="wa-api-phone"
                                type="tel"
                                value={phone}
                                onChange={e => { setPhone(e.target.value); setError(''); }}
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
                                <span className="truncate font-medium">{doc.documentType === 'POS_RECEIPT' ? 'POS_Receipt_' : ''}{doc.documentNo}.pdf</span>
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
                            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                <span>{error}</span>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100">
                    {sentTo ? (
                        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700">Done</button>
                    ) : (
                        <>
                            {onShareLink && (
                                <button
                                    onClick={() => onShareLink({ phone })}
                                    disabled={sending}
                                    className="mr-auto flex items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                                    title="Send a link to the document from your own WhatsApp instead"
                                >
                                    <Link2 size={14} /> Share a link instead
                                </button>
                            )}
                            <button onClick={close} disabled={sending} className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                            <button
                                onClick={send}
                                disabled={sending || !normalized}
                                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 flex items-center gap-2"
                            >
                                <MessageCircle size={15} />
                                {sending ? 'Sending...' : 'Send with PDF'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
