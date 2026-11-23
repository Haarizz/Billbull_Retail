import axios from 'axios';
import api from './axiosConfig';

// Shareable document links (backend: document/share). Used by the WhatsApp send flow when the
// Meta API is not set up: the message carries /d/<token>, which opens PublicDocument.jsx.

const errorText = (err, fallback) => {
    const data = err?.response?.data;
    if (typeof data === 'string' && data) return data;
    if (data?.message) return data.message;
    return fallback;
};

// ── Staff side (signed in) ────────────────────────────────────────────────

/**
 * → { token, path, expiresAt, summary, company }.
 * presentation 'RECEIPT' (POS sales) makes the customer page and summary say "Receipt".
 */
export const createDocumentLink = async (documentType, documentId, html, presentation) => {
    try {
        return (await api.post('/api/document-links', { documentType, documentId, html, presentation })).data;
    } catch (err) {
        throw new Error(errorText(err, 'Could not create the document link.'));
    }
};

/** Earlier links to this document: [{ id, createdAt, createdBy, viewCount, lastViewedAt, expiresAt }] */
export const getDocumentLinks = (documentType, documentId) =>
    api.get('/api/document-links', { params: { documentType, documentId } }).then(r => r.data || []);

/** Tenant default country code for local numbers (WhatsApp Settings); '971' when unavailable. */
export const getWhatsAppDefaultCountryCode = async () => {
    try {
        return (await api.get('/api/whatsapp/status')).data?.defaultCountryCode || '971';
    } catch {
        return '971';
    }
};

/**
 * The customer-facing address for a link path ("/d/<token>"), on this app's own origin. The
 * till (/pos/) shares the origin with Retail, which serves /d/.
 */
export const documentLinkUrl = (path) => `${window.location.origin}${path}`;

// ── Public side (the customer, no login) ──────────────────────────────────
// Deliberately NOT the staff axios instance: that one attaches the staff JWT and sends 401s to
// the staff login page.

const PUBLIC_BASE = import.meta.env.VITE_API_BASE_URL
    || (import.meta.env.DEV ? 'http://localhost:8080' : window.location.origin);

const publicApi = axios.create({ baseURL: PUBLIC_BASE });

/** → { summary, company, html, sharedAt, expiresAt }; throws Error with .status (404 / 410 / 429). */
export const getPublicDocument = async (token) => {
    try {
        return (await publicApi.get(`/api/public/documents/${encodeURIComponent(token)}`)).data;
    } catch (err) {
        const e = new Error(errorText(err, 'Could not load this document.'));
        e.status = err?.response?.status || 0;
        throw e;
    }
};

export const publicDocumentPdfUrl = (token, download = false) =>
    `${PUBLIC_BASE}/api/public/documents/${encodeURIComponent(token)}/pdf${download ? '?download=true' : ''}`;

/** Logos are stored as "/uploads/..." paths served by the backend. */
export const publicAssetUrl = (path) => {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return `${PUBLIC_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
};
