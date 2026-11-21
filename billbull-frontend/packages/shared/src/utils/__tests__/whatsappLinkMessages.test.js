import { describe, expect, it } from 'vitest';
import {
    buildLinkMessage, formatLinkDate, formatLinkMoney, linkMessageKinds, whatsAppOpenUrl,
} from '../whatsappLinkMessages';

const LINK = 'https://acme.billbull.app/d/abc';

const invoice = (over = {}) => ({
    documentType: 'SALES_INVOICE', documentNo: 'INV-2026-00075', customerName: 'Hari Krishnan Nair',
    date: '2026-11-20', dueDate: '2026-11-27', currency: 'AED',
    total: 250, paid: 200, balance: 50, status: 'PARTIALLY_PAID', ...over,
});

describe('formatting', () => {
    it('formats ISO dates without timezone drift', () => {
        expect(formatLinkDate('2026-11-27')).toBe('27 Nov 2026');
        expect(formatLinkDate('2026-05-17T23:30:00')).toBe('17 May 2026');
        expect(formatLinkDate(null)).toBe('');
    });

    it('formats money with the currency code', () => {
        expect(formatLinkMoney('AED', 2800)).toBe('AED 2,800.00');
        expect(formatLinkMoney(null, '50.5')).toBe('AED 50.50');
    });
});

describe('linkMessageKinds', () => {
    it('offers a payment reminder only for invoices with a balance', () => {
        expect(linkMessageKinds(invoice()).map(k => k.key)).toEqual(['invoice', 'reminder']);
        expect(linkMessageKinds(invoice({ balance: 0 })).map(k => k.key)).toEqual(['invoice']);
        expect(linkMessageKinds(invoice({ status: 'CANCELLED' })).map(k => k.key)).toEqual(['invoice']);
        expect(linkMessageKinds({ documentType: 'QUOTATION' })[0].key).toBe('quotation');
        expect(linkMessageKinds({ documentType: 'SALES_ORDER' })[0].key).toBe('order');
    });
});

describe('buildLinkMessage', () => {
    it('invoice message carries the number, amount, balance and link', () => {
        const m = buildLinkMessage('invoice', { summary: invoice(), link: LINK, companyName: 'Pulse Retail' });
        expect(m.startsWith('Hi Hari,')).toBe(true);
        expect(m).toContain('*INV-2026-00075*');
        expect(m).toContain('Amount: *AED 250.00*');
        expect(m).toContain('Balance due: *AED 50.00* (by 27 Nov 2026)');
        expect(m).toContain(LINK);
        expect(m.endsWith('— Pulse Retail')).toBe(true);
    });

    it('paid invoice says paid in full and has no balance line', () => {
        const m = buildLinkMessage('invoice', { summary: invoice({ paid: 250, balance: 0 }), link: LINK });
        expect(m).toContain('Paid in full');
        expect(m).not.toContain('Balance due');
    });

    it('reminder names the balance and the due date', () => {
        const m = buildLinkMessage('reminder', { summary: invoice(), link: LINK, companyName: 'Pulse Retail' });
        expect(m).toContain('friendly reminder from Pulse Retail that *AED 50.00* is due on invoice *INV-2026-00075*, payable by *27 Nov 2026*.');
        expect(m).toContain(LINK);
    });

    it('greets generically for walk-in customers', () => {
        const m = buildLinkMessage('invoice', { summary: invoice({ customerName: 'Walk-in Customer' }), link: LINK });
        expect(m.startsWith('Hello,')).toBe(true);
    });

    it('quotation message shows the validity', () => {
        const m = buildLinkMessage('quotation', {
            summary: { documentType: 'QUOTATION', documentNo: 'QTN-9', customerName: 'Sara', total: 99, currency: 'USD', dueDate: '2026-12-01' },
            link: LINK,
        });
        expect(m).toContain('Quotation: *QTN-9*');
        expect(m).toContain('USD 99.00');
        expect(m).toContain('Valid until: 01 Dec 2026');
    });
});

describe('whatsAppOpenUrl', () => {
    it('targets the desktop app, WhatsApp Web, or wa.me on phones', () => {
        expect(whatsAppOpenUrl('app', '971501234567', 'a b', false)).toBe('whatsapp://send?phone=971501234567&text=a%20b');
        expect(whatsAppOpenUrl('web', '971501234567', 'x', false)).toBe('https://web.whatsapp.com/send?phone=971501234567&text=x');
        expect(whatsAppOpenUrl('app', '971501234567', 'x', true)).toBe('https://wa.me/971501234567?text=x');
        expect(whatsAppOpenUrl('app', '', 'x', false)).toBe('whatsapp://send?text=x');
    });
});
