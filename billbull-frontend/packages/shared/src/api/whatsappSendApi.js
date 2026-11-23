import api from './axiosConfig';

// WhatsApp Business (Meta Cloud API) sending — shared by Retail (quotation / sales order /
// invoice) and the POS till (receipts). Settings-page calls stay in Retail's api/whatsappApi.js,
// which re-exports these.

// { enabled, configured, defaultCountryCode, templates: { QUOTATION: bool, ... , POS_RECEIPT } }
// — readable by any signed-in user. enabled=false means use the link flow instead.
export const getWhatsAppStatus = () => api.get('/api/whatsapp/status');

const DISABLED = { enabled: false, defaultCountryCode: '971', templates: {} };

// Cached briefly so a list of rows (or a busy till) doesn't refetch on every click, while a
// change in WhatsApp Settings is still picked up within a minute.
let statusCache = { at: 0, value: null };
export const loadWhatsAppStatus = async () => {
    if (statusCache.value && Date.now() - statusCache.at < 60_000) return statusCache.value;
    try {
        const value = (await getWhatsAppStatus()).data || DISABLED;
        statusCache = { at: Date.now(), value };
        return value;
    } catch {
        return DISABLED;
    }
};

/** True when this document type goes out through the Meta API (enabled + its template set). */
export const isWhatsAppApiReady = (status, documentType) =>
    Boolean(status?.enabled && status?.templates?.[documentType]);

// Per-document send endpoints. Each renders `html` (the document's PDF HTML) to a PDF and sends
// it with that document's template.
const SEND_PATHS = {
    QUOTATION: (id) => `/api/sales/quotations/${id}/send-whatsapp`,
    SALES_ORDER: (id) => `/api/sales/sales-orders/${id}/send-whatsapp`,
    SALES_INVOICE: (id) => `/api/sales/invoices/${id}/send-whatsapp`,
    POS_RECEIPT: (id) => `/api/sales/invoices/${id}/send-whatsapp-receipt`,
};

export const sendDocumentWhatsApp = async (documentType, id, { toPhone = '', html }) => {
    const path = SEND_PATHS[documentType];
    if (!path) throw new Error(`WhatsApp sending is not supported for ${documentType}.`);
    try {
        const res = await api.post(path(id), { toPhone, html });
        return res.data;
    } catch (err) {
        const data = err?.response?.data;
        const message = typeof data === 'string' ? data : data?.message;
        throw new Error(message || 'Failed to send WhatsApp message');
    }
};

export const getWhatsAppMessages = (documentType, documentId) =>
    api.get('/api/whatsapp/messages', { params: { documentType, documentId } });
