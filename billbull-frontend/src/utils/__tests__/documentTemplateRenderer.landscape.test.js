import { describe, expect, it } from 'vitest';
import { generateDocumentPrintHtml } from '../documentTemplateRenderer';

const printData = {
    title: 'Tax Invoice',
    docNo: 'INV-1',
    date: '2026-10-05',
    vatMode: 'EXCLUSIVE',
    customer: { name: 'Test Customer' },
    items: [{ code: 'A', name: 'Water tank', qty: 1, price: 3500, disc: 20, tax: 5, taxAmt: 133.33, total: 2800, taxableAmount: 2666.67 }],
    totals: { subTotal: 3500, taxableAmount: 2666.67, tax: 133.33, grandTotal: 2810, currency: 'AED' },
    meta: {},
};

const template = (orientation) => ({
    id: 1, name: 'Invoice', category: 'Sales Invoice', paperSize: 'A5', orientation,
    columns: {}, displayOptions: {},
});

const render = (orientation) => generateDocumentPrintHtml(template(orientation), printData, {});

// The landscape selector also appears in the stylesheet, so assert on the shell
// element's own class attribute — otherwise the test passes even when the class
// is never applied.
const shellClass = (html) => html.match(/<div class="(document-shell[^"]*)"/)?.[1] ?? '';

describe('documentTemplateRenderer — landscape sheets', () => {
    it('re-proportions the layout only for landscape orientation', () => {
        expect(shellClass(render('Landscape')).split(/\s+/)).toContain('document-shell-landscape');
        expect(shellClass(render('Portrait')).split(/\s+/)).not.toContain('document-shell-landscape');
    });

    it('keeps the portrait stacked order — bank, terms and footer below the totals', () => {
        // An earlier revision floated totals beside bank/terms to save a sheet.
        // It read worse and stranded the stamp beside long terms, so the stacked
        // order is deliberate; density, not layout, is what keeps it on one sheet.
        const html = render('Landscape');
        expect(html).not.toMatch(/\.document-shell-landscape \.summary-section[^}]*float:/);
        expect(html).not.toMatch(/\.document-shell-landscape \.summary-notes-section[^}]*float:/);
        expect(html).not.toMatch(/\.document-shell-landscape \.document-footer-group[^}]*float:/);
    });

    it('overrides the QR image size with !important, since it is set inline', () => {
        expect(render('Landscape')).toMatch(/\.document-shell-landscape \.qr-container img \{\s*width: 36px !important/);
    });

    it('trims the designer shell padding only on the short sheet', () => {
        // Shell padding differs per layout flavour, so this one needs the
        // designer template rather than the generic 12mm one.
        const designer = (orientation) => generateDocumentPrintHtml(
            { ...template(orientation), salesDesignerSettings: { paperSize: 'A5', orientation } },
            printData,
            {},
        );
        expect(designer('Landscape')).toContain('padding: 10px 28px');
        expect(designer('Portrait')).toContain('padding: 28px 32px');
    });

    it('emits no landscape rules at all for portrait, leaving its output untouched', () => {
        expect(render('Portrait')).not.toContain('.document-shell-landscape');
    });
});
