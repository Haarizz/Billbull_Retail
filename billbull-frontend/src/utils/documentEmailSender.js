// QA-040: Shared helper that turns a designed print template + payload into
// an email-safe HTML body + CID inline attachments, ready to POST to any
// module's /send-email endpoint.
//
// Usage:
//   const { html, inlineAttachments } = await renderDocumentEmail({
//       category: 'Sales Invoice',
//       payload: buildInvoiceDocPayload(),
//       companyProfile: company,
//   });
//   await api.post(`${BASE}/${id}/send-email`, {
//       toEmail, subject, htmlBody: html, inlineAttachments
//   });

import { getTemplatesByCategory } from '../api/printTemplateApi';
import { generateEmailHtml } from './printGenerator';
import { buildEmailBody } from './emailImageInliner';
import billBullLogo from '../assets/billBullLogo.png';

/**
 * Renders the email body for a designed document.
 * Returns { html, inlineAttachments, template } — template returned so the
 * caller can also use it for the in-modal preview iframe (where images are
 * loaded directly from the dev server, no inlining needed).
 *
 * Throws if no template is found for the category — callers should catch
 * and either bail or fall back to the backend's legacy plain-text body.
 */
export const renderDocumentEmail = async ({ category, payload, companyProfile = {} }) => {
    const templates = await getTemplatesByCategory(category);
    const template = (templates && (templates.find(t => t.isDefault) || templates[0])) || null;
    if (!template) {
        throw new Error(`No print template found for category "${category}"`);
    }

    const rawHtml = generateEmailHtml(template, payload, { companyProfile, billBullLogo });
    const { html, inlineAttachments } = await buildEmailBody(rawHtml);
    return { html, inlineAttachments, template, rawHtml };
};

/**
 * Convenience: render + POST in one call. `postFn` receives the body and
 * should return a Promise. Returns whatever postFn returns. Throws on any
 * failure — caller wraps in try/catch + toast.
 */
export const sendDesignedDocumentEmail = async ({
    category, payload, companyProfile = {}, toEmail, subject, postFn,
}) => {
    let htmlBody = '';
    let inlineAttachments = [];
    try {
        const built = await renderDocumentEmail({ category, payload, companyProfile });
        htmlBody = built.html;
        inlineAttachments = built.inlineAttachments;
    } catch (err) {
        // No template / render failure — let the backend fall back to its
        // default plain-text body. POST with empty htmlBody.
        console.warn(`Email render failed for ${category}; falling back:`, err);
    }
    return postFn({ toEmail, subject, htmlBody, inlineAttachments });
};
