import api from '@billbull/shared/api/axiosConfig';

const CONFIG_BASE = '/api/settings/whatsapp-config';

export const getWhatsAppConfig = () => api.get(CONFIG_BASE);

export const saveWhatsAppConfig = (data) => api.put(CONFIG_BASE, data);

export const testWhatsAppConnection = () => api.post(`${CONFIG_BASE}/test`);

// Sending lives in shared so the POS till sends receipts through the same calls.
export {
    getWhatsAppStatus,
    loadWhatsAppStatus,
    isWhatsAppApiReady,
    sendDocumentWhatsApp,
    getWhatsAppMessages,
} from '@billbull/shared/api/whatsappSendApi';

// Mirrors backend PhoneNumberNormalizer; lives in shared so the POS receipt dialog uses it too.
export { normalizeWhatsAppPhone } from '@billbull/shared/utils/whatsappLinkMessages';
