import { describe, expect, it } from 'vitest';
import { generateDocumentEmailHtml, generateDocumentPrintHtml } from '../documentTemplateRenderer';

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

    it('sizes a lowercase "landscape" sheet exactly like "Landscape"', () => {
        // Designer settings and the seeded A5 variants carry lowercase. An exact
        // 'Landscape' match laid the body out 148mm wide and zoomed it to 0.7048
        // while @page still printed a landscape sheet.
        const lower = render('landscape');
        expect(lower).not.toMatch(/zoom: 0\.7048/);
        expect(lower).toMatch(/html,\s*body \{\s*width: 210mm;\s*min-height: 148mm;/);
        // Identical apart from the @page keyword's case, which CSS ignores.
        const norm = (html) => html.replace(/Gen-[^<"]*/g, '').toLowerCase();
        expect(norm(lower)).toBe(norm(render('Landscape')));
    });
});

describe('documentTemplateRenderer — page numbers', () => {
    const withPageNumbers = (on) => generateDocumentPrintHtml(
        { ...template('Portrait'), salesDesignerSettings: { paperSize: 'A5', orientation: 'Portrait', showPageNumbers: on } },
        printData,
        {},
    );

    it('prints "Page X of Y" in the page margin box, never a hardcoded "Page 1 of 1"', () => {
        // counter(pages) only resolves in an @page margin box; the old in-flow label
        // could only ever say "Page 1 of 1", on the last sheet only.
        const html = withPageNumbers(true);
        expect(html).not.toContain('Page 1 of 1');
        expect(html).toMatch(/@bottom-right \{\s*content: "Page " counter\(page\) " of " counter\(pages\);/);
        // The designer layout has no bottom page margin; the label needs room.
        expect(html).toMatch(/@page \{\s*size: A5 Portrait;\s*margin: 0 0 7mm 0;/);
    });

    it('leaves the page untouched when page numbers are off', () => {
        const html = withPageNumbers(false);
        expect(html).not.toContain('@bottom-right');
        expect(html).toMatch(/@page \{\s*size: A5 Portrait;\s*margin: 0 0 0 0;/);
    });
});

describe('documentTemplateRenderer — GRN page numbers', () => {
    const grn = (settings = {}) => ({
        id: 7, name: 'GRN', category: 'Goods Receipt Note', paperSize: 'A4', orientation: 'Portrait',
        displayOptions: JSON.stringify({ purchaseDesignerSettings: { docType: 'grn', ...settings } }),
    });
    const grnData = { docNo: 'GRN-1', date: '2026-11-18', items: [{ code: 'A', name: 'Tank', qty: 1 }], totals: {}, meta: {} };

    it('prints "Page X of Y" in the margin box instead of a fixed "Page 1 of 1" in the footer bar', () => {
        const html = generateDocumentPrintHtml(grn(), grnData, {});
        expect(html).toContain('class="grn-doc"');
        expect(html).not.toContain('Page 1 of 1');
        expect(html).toMatch(/@bottom-right \{\s*content: "Page " counter\(page\) " of " counter\(pages\);/);
        expect(html).toContain('Confidential — Internal Use Only');
    });

    it('paints the reserved bottom margin in the sheet colour, so a tinted GRN has no white band', () => {
        const html = generateDocumentPrintHtml(grn({ backgroundColor: '#FFF4D6' }), grnData, {});
        expect(html).toMatch(/margin: 0 0 7mm 0;[\s\S]*?background: #FFF4D6;\s*@bottom-right/i);
    });

    it('keeps the full-bleed page when page numbers are off, and in email', () => {
        const off = generateDocumentPrintHtml(grn({ showPageNumbers: false }), grnData, {});
        expect(off).toContain('@page { size: A4 portrait; margin: 0; }');
        expect(off).not.toContain('@bottom-right');
        expect(generateDocumentEmailHtml(grn(), grnData, {})).not.toContain('@bottom-right');
    });
});
