import { describe, expect, it } from 'vitest';
import { normalizeWhatsAppPhone } from '../../api/whatsappApi';
import { buildWhatsAppMessage } from './useWhatsAppDocumentSend';

// Must agree with backend PhoneNumberNormalizerTest — the dialog shows this number as
// "Will send to", and the backend normalises the same input independently.
describe('normalizeWhatsAppPhone', () => {
    it('adds the country code to local numbers and drops the trunk zero', () => {
        expect(normalizeWhatsAppPhone('050 123 4567', '971')).toBe('971501234567');
        expect(normalizeWhatsAppPhone('501234567', '971')).toBe('971501234567');
    });

    it('keeps numbers already in international form', () => {
        expect(normalizeWhatsAppPhone('+91 92076 85882', '971')).toBe('919207685882');
        expect(normalizeWhatsAppPhone('0091 9207685882', '971')).toBe('919207685882');
        expect(normalizeWhatsAppPhone('971-50-1234567', '971')).toBe('971501234567');
    });

    it('returns empty for blank or impossible numbers', () => {
        expect(normalizeWhatsAppPhone('', '971')).toBe('');
        expect(normalizeWhatsAppPhone('+12', '971')).toBe('');
    });
});

describe('buildWhatsAppMessage', () => {
    const base = { customerName: 'Test Customer', amountText: 'AED 2,800.00' };

    it('words each document type like its approved template', () => {
        expect(buildWhatsAppMessage({ ...base, documentType: 'QUOTATION', documentNo: 'QTN-1', dateText: '08 Oct 2026' }))
            .toBe('Dear Test Customer, please find attached quotation QTN-1 for AED 2,800.00, valid until 08 Oct 2026.');
        expect(buildWhatsAppMessage({ ...base, documentType: 'SALES_ORDER', documentNo: 'SO-1', dateText: '15 Oct 2026' }))
            .toBe('Dear Test Customer, thank you for your order. Please find attached sales order SO-1 for AED 2,800.00, expected delivery 15 Oct 2026.');
        expect(buildWhatsAppMessage({ ...base, documentType: 'SALES_INVOICE', documentNo: 'INV-1', dateText: '31 Oct 2026' }))
            .toBe('Dear Test Customer, please find attached invoice INV-1 for AED 2,800.00, due on 31 Oct 2026.');
    });

    it('omits the date clause when there is no date', () => {
        expect(buildWhatsAppMessage({ ...base, documentType: 'SALES_INVOICE', documentNo: 'INV-1', dateText: '' }))
            .toBe('Dear Test Customer, please find attached invoice INV-1 for AED 2,800.00.');
    });
});
