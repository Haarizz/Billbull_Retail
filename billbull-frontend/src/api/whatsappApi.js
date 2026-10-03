import api from './axiosConfig';

const CONFIG_BASE = '/api/settings/whatsapp-config';

export const getWhatsAppConfig = () => api.get(CONFIG_BASE);

export const saveWhatsAppConfig = (data) => api.put(CONFIG_BASE, data);

export const testWhatsAppConnection = () => api.post(`${CONFIG_BASE}/test`);

// { enabled, configured, defaultCountryCode } — readable by any signed-in user.
// enabled=false means send buttons should use the wa.me + manual-attach fallback.
export const getWhatsAppStatus = () => api.get('/api/whatsapp/status');

// Per-document send endpoints. Each renders `html` (the same print HTML as the
// document's Download PDF) to a PDF and sends it with that document's template.
const SEND_PATHS = {
    QUOTATION: (id) => `/api/sales/quotations/${id}/send-whatsapp`,
    SALES_ORDER: (id) => `/api/sales/sales-orders/${id}/send-whatsapp`,
    SALES_INVOICE: (id) => `/api/sales/invoices/${id}/send-whatsapp`,
};

export const sendDocumentWhatsApp = async (documentType, id, { toPhone = '', html }) => {
    const path = SEND_PATHS[documentType];
    if (!path) throw new Error(`WhatsApp sending is not supported for ${documentType}.`);
    try {
        const res = await api.post(path(id), { toPhone, html });
        return res.data;
    } catch (err) {
        const message = err?.response?.data;
        throw new Error(typeof message === 'string' && message ? message : 'Failed to send WhatsApp message');
    }
};

export const getWhatsAppMessages = (documentType, documentId) =>
    api.get('/api/whatsapp/messages', { params: { documentType, documentId } });

// Mirrors backend PhoneNumberNormalizer so the send dialog shows the exact number
// the message will go to. "+"/"00" → international; >10 digits → already has a
// country code; otherwise strip trunk zeros and prepend the tenant's code.
export const normalizeWhatsAppPhone = (raw, defaultCountryCode = '971') => {
    const trimmed = String(raw || '').trim();
    const digits = trimmed.replace(/\D/g, '');
    if (!digits) return '';
    let result;
    if (trimmed.startsWith('+')) result = digits;
    else if (digits.startsWith('00')) result = digits.slice(2);
    else if (digits.length > 10) result = digits;
    else result = String(defaultCountryCode || '').replace(/\D/g, '') + digits.replace(/^0+/, '');
    return result.length >= 8 && result.length <= 15 ? result : '';
};
