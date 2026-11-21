import { describe, expect, it } from 'vitest';
import { buildLinkMessage, isPrivateLinkHost, linkMessageKinds, normalizeWhatsAppPhone, whatsAppOpenUrl } from '../whatsappLinkMessages';

describe('isPrivateLinkHost', () => {
    it('flags addresses a customer phone cannot reach', () => {
        for (const u of ['http://localhost:5174/d/x', 'http://127.0.0.1:8080/d/x', 'http://192.168.1.20/d/x',
            'http://10.0.0.5/d/x', 'http://172.20.1.1/d/x', 'http://till.local/d/x', 'http://[::1]:5173/d/x']) {
            expect(isPrivateLinkHost(u), u).toBe(true);
        }
    });

    it('accepts public addresses', () => {
        for (const u of ['https://hilite.billbull.app/d/x', 'http://77.37.49.42/d/x', 'http://172.32.0.1/d/x', 'https://localhost.example.com/d/x']) {
            expect(isPrivateLinkHost(u), u).toBe(false);
        }
        expect(isPrivateLinkHost('not a url')).toBe(false);
    });
});

// POS "Share Receipt → WhatsApp": the server labels a POS sale "Receipt" (presentation RECEIPT).
const receipt = (over = {}) => ({
    documentType: 'SALES_INVOICE', label: 'Receipt', documentNo: 'INV-2026-0130', customerName: 'Sara Ali',
    date: '2026-11-20', currency: 'AED', total: 105, paid: 105, balance: 0, status: 'PAID', ...over,
});

describe('POS receipt link messages', () => {
    it('offers a Receipt message, plus a reminder only when something is still owed', () => {
        expect(linkMessageKinds(receipt()).map(k => k.key)).toEqual(['receipt']);
        expect(linkMessageKinds(receipt({ paid: 50, balance: 55 })).map(k => k.key)).toEqual(['receipt', 'reminder']);
    });

    it('words the message as a receipt', () => {
        const m = buildLinkMessage('receipt', { summary: receipt(), link: 'https://t.billbull.app/d/x', companyName: 'Pulse Retail' });
        expect(m).toContain('Thank you for shopping with Pulse Retail!');
        expect(m).toContain('🧾 Receipt: *INV-2026-0130*');
        expect(m).toContain('Paid in full');
        expect(m).toContain('View your receipt here 👇\nhttps://t.billbull.app/d/x');
        expect(m).not.toMatch(/invoice/i);
    });

    it('a normal invoice keeps invoice wording', () => {
        const m = buildLinkMessage('invoice', { summary: receipt({ label: 'Invoice' }), link: 'L' });
        expect(m).toContain('Invoice: *INV-2026-0130*');
    });
});

describe('whatsAppOpenUrl in the POS desktop app', () => {
    it('uses wa.me for "app" (whatsapp:// is refused there) but keeps WhatsApp Web', () => {
        expect(whatsAppOpenUrl('app', '971501234567', 'x', false, true)).toBe('https://wa.me/971501234567?text=x');
        expect(whatsAppOpenUrl('web', '971501234567', 'x', false, true)).toBe('https://web.whatsapp.com/send?phone=971501234567&text=x');
    });
});

describe('normalizeWhatsAppPhone (moved to shared)', () => {
    it('still normalises like the backend', () => {
        expect(normalizeWhatsAppPhone('050 123 4567', '971')).toBe('971501234567');
        expect(normalizeWhatsAppPhone('+91 92076 85882', '971')).toBe('919207685882');
    });
});
