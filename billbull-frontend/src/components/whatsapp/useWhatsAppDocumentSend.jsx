import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, Info } from 'lucide-react';
import { isWhatsAppApiReady, loadWhatsAppStatus, normalizeWhatsAppPhone } from '../../api/whatsappApi';
import { downloadPdfViaServer } from '@billbull/shared/utils/printGenerator';
import { buildWhatsAppMessage } from '@billbull/shared/utils/whatsappLinkMessages';
import WhatsAppApiSendDialog from '@billbull/shared/components/whatsapp/WhatsAppApiSendDialog';
import WhatsAppLinkShareDialog from '@billbull/shared/components/whatsapp/WhatsAppLinkShareDialog';

// Shared "send this document on WhatsApp" flow for Quotation / Sales Order / Sales Invoice.
//
// With the WhatsApp Business API enabled (Settings → WhatsApp Settings) and a template set
// for the document type, opens WhatsAppApiSendDialog, which sends the PDF as a real attachment.
// Otherwise it opens WhatsAppLinkShareDialog: the message carries a link to a public page with
// the document summary and its PDF (wa.me links cannot carry files). That dialog still offers
// the older "download the PDF and attach it in the chat" path. Both dialogs live in
// @billbull/shared so the POS till sends receipts the same way.
//
// Usage:
//   const { openWhatsApp, whatsAppElement } = useWhatsAppDocumentSend();
//   openWhatsApp({ documentType: 'SALES_INVOICE', documentId, documentNo, customerName,
//                  phone, amountText, dateText, buildHtml: async () => html });
//   ...render {whatsAppElement} once in the page.
// buildHtml runs when the user clicks Send (or immediately in the fallback), so pages whose
// print data comes from editor state should pass a function that reads the latest state.

// Kept for existing imports (whatsapp.test.js); the wording lives in the shared module.
export { buildWhatsAppMessage };

export function useWhatsAppDocumentSend() {
    const [apiDialog, setApiDialog] = useState(null);   // { doc, status }
    const [linkDialog, setLinkDialog] = useState(null); // { doc, status }
    const [toast, setToast] = useState(null);

    // Warm the status cache so a click can decide API vs. link without waiting.
    useEffect(() => { loadWhatsAppStatus(); }, []);

    const notify = (message, type = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 6000);
    };

    const openWhatsApp = async (doc) => {
        const status = await loadWhatsAppStatus();
        if (doc.documentId && isWhatsAppApiReady(status, doc.documentType)) {
            setApiDialog({ doc, status });
            return;
        }
        if (doc.documentId) {
            setLinkDialog({ doc, status });
            return;
        }
        // An unsaved document has no id to link to.
        await downloadAndOpenChat(doc, status);
    };

    // The manual-attach path: open the chat first (while the click still counts as a user
    // gesture, so popup blockers allow it), then download the PDF. Yield before buildHtml so a
    // page that just loaded the document into editor state has re-rendered.
    const downloadAndOpenChat = async (doc, status) => {
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

    const whatsAppElement = (
        <>
            {apiDialog && (
                <WhatsAppApiSendDialog
                    doc={apiDialog.doc}
                    status={apiDialog.status}
                    onClose={() => setApiDialog(null)}
                    onSent={(message) => { setApiDialog(null); notify(message, 'success'); }}
                    onShareLink={({ phone }) => {
                        const { doc, status } = apiDialog;
                        setApiDialog(null);
                        setLinkDialog({ doc: { ...doc, phone }, status });
                    }}
                />
            )}
            {linkDialog && (
                <WhatsAppLinkShareDialog
                    doc={linkDialog.doc}
                    defaultCountryCode={linkDialog.status.defaultCountryCode}
                    notify={notify}
                    onClose={() => setLinkDialog(null)}
                    onDownloadInstead={() => {
                        const { doc, status } = linkDialog;
                        setLinkDialog(null);
                        downloadAndOpenChat(doc, status);
                    }}
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
