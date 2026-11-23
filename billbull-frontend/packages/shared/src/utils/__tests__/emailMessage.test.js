import { describe, it, expect } from 'vitest';
import {
    buildReceiptEmailMessage,
    defaultDocumentEmailMessage,
    defaultReceiptEmailMessage,
    EMAIL_PREVIEW_BACKDROP_STYLE,
    emailMessageToHtml,
    withEmailMessage,
} from '../emailMessage';

describe('emailMessage', () => {
    it('default document message names the document and signs off with the company', () => {
        const msg = defaultDocumentEmailMessage({ docLabel: 'Sales Invoice', docNumber: 'INV-1', companyName: 'Acme LLC' });
        expect(msg).toMatch(/^Dear Customer,/);
        expect(msg).toContain('Please find attached Sales Invoice INV-1.');
        expect(msg.endsWith('Best regards,\nAcme LLC')).toBe(true);
        expect(defaultDocumentEmailMessage({}).endsWith('Best regards')).toBe(true);
        expect(defaultReceiptEmailMessage()).toContain('receipt');
    });

    it('turns blank lines into paragraphs, single newlines into <br>, and escapes HTML', () => {
        const html = emailMessageToHtml('Hi <b>you</b> & co,\nline 2\n\nPara 2');
        expect(html).toContain('<p style="margin:0 0 14px 0;">Hi &lt;b&gt;you&lt;/b&gt; &amp; co,<br>line 2</p>');
        expect(html).toContain('>Para 2</p>');
        expect(emailMessageToHtml('   \n ')).toBe('');
    });

    it('puts the message at the start of <body>, or before HTML without one', () => {
        const out = withEmailMessage('<html><body class="x"><table>doc</table></body></html>', 'Hello');
        expect(out).toMatch(/<html><body class="x"><div[^>]*><div[^>]*><p[^>]*>Hello<\/p><\/div><\/div><table>doc/);
        expect(withEmailMessage('<table>doc</table>', 'Hello')).toMatch(/Hello<\/p><\/div><\/div><table>doc/);
        expect(withEmailMessage('<body>doc</body>', '')).toBe(`${EMAIL_PREVIEW_BACKDROP_STYLE}<body>doc</body>`);
        expect(withEmailMessage('', '')).toBe('');
    });

    it('preview replaces a black document backdrop with a light one, inside <head> when there is one', () => {
        const sheet = '<html><head><style>body{background:#000000;}</style></head><body>page</body></html>';
        const out = withEmailMessage(sheet, 'Hi');
        // After the template's own styles, so it wins the cascade.
        expect(out).toContain(`body{background:#000000;}</style>${EMAIL_PREVIEW_BACKDROP_STYLE}</head>`);
        expect(EMAIL_PREVIEW_BACKDROP_STYLE).toContain('html{background:#f1f5f9 !important;}');
        expect(EMAIL_PREVIEW_BACKDROP_STYLE).toContain('body{background:#ffffff !important;');
        expect(withEmailMessage('<table>doc</table>', 'Hi').startsWith(EMAIL_PREVIEW_BACKDROP_STYLE)).toBe(true);
    });

    it('paints its own white background and dark text, in the email and in the preview band', () => {
        expect(emailMessageToHtml('Hi')).toMatch(/background:#ffffff;/);
        expect(emailMessageToHtml('Hi')).toMatch(/color:#1f2937;/);
        expect(withEmailMessage('<body style="background:#000">doc</body>', 'Hi'))
            .toMatch(/<body style="background:#000"><div style="background:#ffffff;border-bottom:1px solid #e5e7eb;/);
    });

    it('renders *text* as bold, as WhatsApp does, without letting HTML through', () => {
        const html = emailMessageToHtml('Amount: *AED 4,000.00* and *<i>x</i>*');
        expect(html).toContain('Amount: <strong style="color:#111827;">AED 4,000.00</strong>');
        expect(html).toContain('<strong style="color:#111827;">&lt;i&gt;x&lt;/i&gt;</strong>');
        expect(emailMessageToHtml('2 * 3 = 6')).toContain('2 * 3 = 6');
    });
});

describe('buildReceiptEmailMessage — the WhatsApp receipt message, as email', () => {
    it('greets by first name, thanks with the company, lists the receipt facts and signs off', () => {
        expect(buildReceiptEmailMessage({
            customerName: 'Fatima Hassan', documentNo: 'INV-2026-0158', dateText: '20 Nov 2026',
            amountText: 'AED 4,000.00', companyName: 'BillBull Trading LLC',
        })).toBe([
            'Hi Fatima,',
            '',
            'Thank you for shopping with BillBull Trading LLC! 🛍️',
            '',
            '🧾 Receipt: *INV-2026-0158*',
            '📅 Date: 20 Nov 2026',
            '💳 Amount: *AED 4,000.00*',
            '✅ Paid in full',
            '',
            '📎 Your receipt is attached to this email as a PDF.',
            '',
            'Best regards,\nBillBull Trading LLC',
        ].join('\n'));
    });

    it('walk-in says Hello, an unpaid sale shows the balance instead of Paid in full', () => {
        const msg = buildReceiptEmailMessage({ customerName: 'Walk-in Customer', documentNo: 'R-1', amountText: 'AED 10.00', balanceText: 'AED 4.00' });
        expect(msg.startsWith('Hello,\n')).toBe(true);
        expect(msg).toContain('⚠️ Balance due: *AED 4.00*');
        expect(msg).not.toContain('Paid in full');
        expect(msg).toContain('Thank you for shopping! 🛍️');
        expect(msg.endsWith('Best regards')).toBe(true);
    });
});
