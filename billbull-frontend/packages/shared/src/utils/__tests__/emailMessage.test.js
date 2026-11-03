import { describe, it, expect } from 'vitest';
import {
    defaultDocumentEmailMessage,
    defaultReceiptEmailMessage,
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
        expect(html).toContain('<p style="margin:0 0 12px 0;">Hi &lt;b&gt;you&lt;/b&gt; &amp; co,<br>line 2</p>');
        expect(html).toContain('>Para 2</p>');
        expect(emailMessageToHtml('   \n ')).toBe('');
    });

    it('puts the message at the start of <body>, or before HTML without one', () => {
        const out = withEmailMessage('<html><body class="x"><table>doc</table></body></html>', 'Hello');
        expect(out).toMatch(/^<html><body class="x"><div[^>]*><p[^>]*>Hello<\/p><\/div><table>doc/);
        expect(withEmailMessage('<table>doc</table>', 'Hello')).toMatch(/Hello<\/p><\/div><table>doc/);
        expect(withEmailMessage('<body>doc</body>', '')).toBe('<body>doc</body>');
    });
});
