// The typed message ("Dear Customer, please find attached …") that every
// send-email dialog puts at the top of the email, above the rendered document.
// The message is plain text: it is escaped and blank lines become paragraphs.

const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Default message for a document email. */
export const defaultDocumentEmailMessage = ({ docLabel, docNumber, companyName } = {}) => {
    const doc = [docLabel, docNumber].filter(Boolean).join(' ') || 'the document';
    return [
        'Dear Customer,',
        '',
        `Please find attached ${doc}.`,
        '',
        'If you have any questions, please feel free to contact us.',
        '',
        'Thank you for your business.',
        '',
        companyName ? `Best regards,\n${companyName}` : 'Best regards',
    ].join('\n');
};

/** Default message for a POS receipt email. */
export const defaultReceiptEmailMessage = () => [
    'Dear Customer,',
    '',
    'Thank you for shopping with us. Please find your receipt attached.',
    '',
    'Best regards',
].join('\n');

const firstName = (name) => {
    const n = String(name || '').trim();
    if (!n || n.toLowerCase() === 'customer' || /walk[- ]?in/i.test(n)) return '';
    return n.split(/\s+/)[0];
};

/**
 * POS receipt email message in the same shape as the WhatsApp receipt message
 * (utils/whatsappLinkMessages buildLinkMessage 'receipt'): greeting, thanks, the
 * receipt facts one per line, then the sign-off. *text* is bold in the email.
 *
 * @param customerName  '' / walk-in → "Hello,"
 * @param documentNo    receipt / invoice number
 * @param dateText      already formatted ("20 Nov 2026"), optional
 * @param amountText    already formatted ("AED 4,000.00"), optional
 * @param balanceText   formatted amount still owed; '' when settled
 * @param companyName   optional; used in the thanks and the sign-off
 */
export const buildReceiptEmailMessage = ({ customerName, documentNo, dateText, amountText, balanceText, companyName } = {}) => {
    const company = String(companyName || '').trim();
    const name = firstName(customerName);
    const lines = [
        name ? `Hi ${name},` : 'Hello,',
        '',
        `Thank you for shopping${company ? ` with ${company}` : ''}! 🛍️`,
        '',
    ];
    if (documentNo) lines.push(`🧾 Receipt: *${documentNo}*`);
    if (dateText) lines.push(`📅 Date: ${dateText}`);
    if (amountText) lines.push(`💳 Amount: *${amountText}*`);
    if (balanceText) lines.push(`⚠️ Balance due: *${balanceText}*`);
    else if (amountText) lines.push('✅ Paid in full');
    lines.push('', '📎 Your receipt is attached to this email as a PDF.');
    lines.push('', company ? `Best regards,\n${company}` : 'Best regards');
    return lines.join('\n');
};

/**
 * Plain-text message → email-safe HTML block (inline styles only). '' when empty.
 * Blank lines split paragraphs, single newlines are line breaks and *text* is bold,
 * as in WhatsApp. The block always paints its own white background and dark text so
 * it reads the same in any mail client and above any document in the preview.
 */
export const emailMessageToHtml = (message) => {
    const text = String(message || '').replace(/\r\n?/g, '\n').trim();
    if (!text) return '';
    const paragraphs = text
        .split(/\n[ \t]*\n/)
        .map((p) => `<p style="margin:0 0 14px 0;">${escapeHtml(p.trim())
            .replace(/\*([^*\n]+)\*/g, '<strong style="color:#111827;">$1</strong>')
            .replace(/\n/g, '<br>')}</p>`)
        .join('');
    return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;background:#ffffff;padding:20px 24px 6px 24px;max-width:640px;">${paragraphs}</div>`;
};

// Preview only: sheet templates paint <body> black (their designer backdrop). In the email
// preview that shows as black bars beside the message and the page, so the surround becomes a
// light grey and the page itself white. The PDF is rendered from the untouched print HTML.
export const EMAIL_PREVIEW_BACKDROP_STYLE = '<style data-email-preview>html{background:#f1f5f9 !important;}body{background:#ffffff !important;margin-left:auto !important;margin-right:auto !important;}</style>';

const withPreviewBackdrop = (doc) => {
    if (!doc) return doc;
    const headEnd = /<\/head\s*>/i.exec(doc);
    if (headEnd) return doc.slice(0, headEnd.index) + EMAIL_PREVIEW_BACKDROP_STYLE + doc.slice(headEnd.index);
    return EMAIL_PREVIEW_BACKDROP_STYLE + doc;
};

/**
 * Preview HTML: the message block at the start of the document's <body> (or before the HTML if
 * it has none), on a light backdrop instead of whatever page colour the document paints.
 */
export const withEmailMessage = (html, message) => {
    const text = emailMessageToHtml(message);
    const doc = html || '';
    if (!text) return withPreviewBackdrop(doc);
    // Full-width white band with a divider: the document below may paint its own page colour.
    const block = `<div style="background:#ffffff;border-bottom:1px solid #e5e7eb;margin:0 0 16px 0;">${text}</div>`;
    const bodyTag = /<body\b[^>]*>/i.exec(doc);
    if (!bodyTag) return withPreviewBackdrop(block + doc);
    const at = bodyTag.index + bodyTag[0].length;
    return withPreviewBackdrop(doc.slice(0, at) + block + doc.slice(at));
};
