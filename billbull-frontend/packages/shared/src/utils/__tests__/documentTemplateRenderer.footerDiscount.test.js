import { describe, expect, it } from 'vitest';
import { generateDocumentPrintHtml } from '../documentTemplateRenderer';

const printData = {
    title: 'TAX INVOICE',
    docNo: 'INV-1',
    date: '2026-10-01',
    vatMode: 'EXCLUSIVE',
    customer: { name: 'Test Customer' },
    items: [
        { code: 'A', name: 'Water tank', qty: 1, price: 3500, disc: 20, tax: 5, taxAmt: 135.3, total: 2841.34, taxableAmount: 2706.04, footerDiscount: 93.96 },
        { code: 'B', name: 'Pump', qty: 1, price: 200, disc: 10, tax: 20, taxAmt: 34.79, total: 208.75, taxableAmount: 173.96, footerDiscount: 6.04 },
    ],
    totals: {
        subTotal: 3700, taxableAmount: 2880, tax: 170.09, grandTotal: 3050.09, currency: 'AED',
        itemDiscountAmount: 720, footerDiscountAmount: 100, billDiscountAmount: 820, discountAmount: 820,
    },
    meta: {},
};

const template = (columns = {}) => ({ id: 1, name: 'Invoice', category: 'Sales Invoice', columns, displayOptions: {} });

describe('documentTemplateRenderer — per-line Footer Disc. column', () => {
    it('is off by default so existing templates keep their layout', () => {
        const html = generateDocumentPrintHtml(template(), printData, {});
        expect(html).not.toContain('Footer Disc.');
    });

    it('prints each line share when the template opts in', () => {
        const html = generateDocumentPrintHtml(template({ footerDiscount: true, taxableAmount: true }), printData, {});
        expect(html).toContain('Footer Disc.');
        expect(html).toContain('-93.96');
        expect(html).toContain('-6.04');
        // Taxable after footer, as passed per line.
        expect(html).toContain('2,706.04');
    });
});
