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

/** Plain-text message → email-safe HTML block (inline styles only). '' when empty. */
export const emailMessageToHtml = (message) => {
    const text = String(message || '').replace(/\r\n?/g, '\n').trim();
    if (!text) return '';
    const paragraphs = text
        .split(/\n[ \t]*\n/)
        .map((p) => `<p style="margin:0 0 12px 0;">${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
        .join('');
    return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;padding:16px 20px;">${paragraphs}</div>`;
};

/** Puts the message block at the start of the email's <body> (or before the HTML if it has none). */
export const withEmailMessage = (html, message) => {
    const block = emailMessageToHtml(message);
    const doc = html || '';
    if (!block) return doc;
    const bodyTag = /<body\b[^>]*>/i.exec(doc);
    if (!bodyTag) return block + doc;
    const at = bodyTag.index + bodyTag[0].length;
    return doc.slice(0, at) + block + doc.slice(at);
};
