import { describe, expect, it } from 'vitest';
import {
    generateDocumentEmailHtml,
    generateDocumentPrintHtml,
    resolveDocumentTerms
} from '../documentTemplateRenderer';
import { SALES_INVOICE_LAYOUT_STYLES, defaultStyledInvoiceSettings } from '../salesInvoiceStyledLayouts';

// A document's own Terms & Conditions (meta.terms) print instead of the template's default.

const printData = (meta = {}) => ({
    title: 'Tax Invoice',
    docNo: 'INV-9',
    date: '2026-11-03',
    vatMode: 'EXCLUSIVE',
    customer: { name: 'Green Mart', address: 'Dubai' },
    items: [{ code: 'A1', name: 'Widget', qty: 1, price: 100, tax: 5, taxAmt: 5, total: 105 }],
    totals: { subTotal: 100, taxableAmount: 100, tax: 5, grandTotal: 105, currency: 'AED' },
    meta: { status: 'DRAFT', ...meta }
});

const standardTemplate = {
    category: 'Sales Invoice', name: 'Default', templateType: 'FULL', paperSize: 'A4', orientation: 'Portrait',
    termsContent: 'TEMPLATE-TERMS-TEXT',
    columns: JSON.stringify({ description: true, qty: true, unitPrice: true, tax: true, total: true }),
    displayOptions: JSON.stringify({ showLogo: true, showCompanyDetails: true, showCustomerDetails: true, showTerms: true })
};

const styledTemplate = (layoutStyle) => {
    const settings = { ...defaultStyledInvoiceSettings(layoutStyle), termsText: 'TEMPLATE-TERMS-TEXT', showTerms: true };
    return {
        category: 'Sales Invoice', name: 'Styled', templateType: 'FULL', paperSize: 'A4', orientation: 'Portrait',
        columns: '{}', termsContent: settings.termsText,
        displayOptions: JSON.stringify({ salesDesigner: 'document', salesDesignerSettings: settings })
    };
};

describe('document terms override', () => {
    it('resolveDocumentTerms: own string wins, absent falls back, empty means none', () => {
        expect(resolveDocumentTerms({ meta: { terms: 'Mine' } }, 'Tpl')).toBe('Mine');
        expect(resolveDocumentTerms({ meta: { terms: '' } }, 'Tpl')).toBe('');
        expect(resolveDocumentTerms({ meta: {} }, 'Tpl')).toBe('Tpl');
        expect(resolveDocumentTerms({}, undefined)).toBe('');
    });

    it.each([
        ['print', generateDocumentPrintHtml],
        ['email', generateDocumentEmailHtml]
    ])('standard template (%s) prints the invoice terms instead of the template terms', (_, render) => {
        const own = render(standardTemplate, printData({ terms: 'INVOICE-OWN-TERMS' }));
        expect(own).toContain('INVOICE-OWN-TERMS');
        expect(own).not.toContain('TEMPLATE-TERMS-TEXT');

        const legacy = render(standardTemplate, printData());
        expect(legacy).toContain('TEMPLATE-TERMS-TEXT');

        const none = render(standardTemplate, printData({ terms: '' }));
        expect(none).not.toContain('TEMPLATE-TERMS-TEXT');
    });

    it.each(SALES_INVOICE_LAYOUT_STYLES.map((style) => style.id))('styled layout %s prints the invoice terms', (layoutStyle) => {
        const html = generateDocumentPrintHtml(styledTemplate(layoutStyle), printData({ terms: 'INVOICE-OWN-TERMS' }));
        expect(html).toContain('INVOICE-OWN-TERMS');
        expect(html).not.toContain('TEMPLATE-TERMS-TEXT');
    });
});
