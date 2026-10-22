import { describe, expect, it } from 'vitest';
import {
    generateDocumentEmailHtml,
    generateDocumentPdfHtml,
    generateDocumentPrintHtml
} from '../documentTemplateRenderer';
import {
    SALES_INVOICE_LAYOUT_STYLES,
    STYLED_INVOICE_COLORS,
    STYLED_INVOICE_SECTIONS,
    defaultStyledInvoiceSettings,
    resolveStyledInvoiceColors
} from '../salesInvoiceStyledLayouts';

const printData = {
    title: 'Tax Invoice',
    docNo: 'INV-77',
    date: '2026-10-05',
    vatMode: 'EXCLUSIVE',
    customer: { name: 'Green Mart <LLC>', address: 'Al Quoz, Dubai', phone: '+971 50 555 0198', trn: '200053827000003' },
    items: [
        { code: 'A', name: 'Pro Annual License', localName: 'ترخيص سنوي', qty: 2, price: 1000, disc: 0, tax: 5, taxAmt: 100, total: 2100, taxableAmount: 2000 },
        { code: 'B', name: 'Onboarding', qty: 1, price: 500, disc: 0, tax: 5, taxAmt: 25, total: 525, taxableAmount: 500 }
    ],
    totals: { subTotal: 2500, taxableAmount: 2500, tax: 125, grandTotal: 2625, currency: 'AED' },
    meta: { status: 'Unpaid', paymentMode: 'Credit', linkedDeliveryNote: 'DN-9', notes: 'Deliver to gate 3' }
};

const companyProfile = {
    companyName: 'Acme Trading',
    localName: 'أكمي للتجارة',
    trn: '100000000000003',
    address: 'Business Bay, Dubai',
    currency: 'AED'
};

const templateFor = (layoutStyle, overrides = {}) => ({
    id: 9,
    name: 'Styled',
    category: 'Sales Invoice',
    paperSize: 'A4',
    orientation: 'Portrait',
    columns: '{}',
    termsContent: 'Pay within 30 days.',
    displayOptions: JSON.stringify({
        salesDesignerSettings: { ...defaultStyledInvoiceSettings(layoutStyle), ...overrides }
    })
});

const render = (layoutStyle, overrides, data = printData) =>
    generateDocumentPrintHtml(templateFor(layoutStyle, overrides), data, { companyProfile });

describe('styled sales invoice layouts', () => {
    it.each(SALES_INVOICE_LAYOUT_STYLES.map((style) => style.id))('%s renders the real invoice data', (layoutStyle) => {
        const html = render(layoutStyle);
        expect(html).toContain('INV-77');
        expect(html).toContain('Pro Annual License');
        expect(html).toContain('2,625.00');
        expect(html).toContain('Acme Trading');
        // Customer text is escaped, never injected.
        expect(html).toContain('Green Mart &lt;LLC&gt;');
        expect(html).not.toContain('Green Mart <LLC>');
        // Not the standard document builder.
        expect(html).not.toContain('document-shell');
    });

    it('prints Arabic company and item names on the bilingual layouts', () => {
        for (const layoutStyle of ['minimal-bilingual', 'column-bilingual']) {
            const html = render(layoutStyle);
            expect(html).toContain('أكمي للتجارة');
            expect(html).toContain('ترخيص سنوي');
            expect(html).toContain('فاتورة ضريبية');
        }
    });

    it('drops VAT columns and the seller TRN when the invoice carries no tax', () => {
        // Mirrors applyTaxAwareDisplayOptions for a no-tax SALES INVOICE.
        const taxOff = { colVAT: false, showVATTotal: false, showTRN: false };
        const html = render('column-bilingual', taxOff);
        expect(html).not.toContain('VAT Amount');
        expect(html).not.toContain('100000000000003');
        expect(render('column-bilingual')).toContain('VAT Amount');
    });

    it('routes PDF and email through the same layout', () => {
        const template = templateFor('elegant');
        expect(generateDocumentPdfHtml(template, printData, { companyProfile })).toContain('Balance Due');
        const email = generateDocumentEmailHtml(template, printData, { companyProfile });
        expect(email).toContain('Balance Due');
        expect(email).not.toContain('@page');
    });

    it('leaves non-styled and non-invoice templates on the standard builder', () => {
        const standard = { ...templateFor('elegant'), displayOptions: '{}' };
        expect(generateDocumentPrintHtml(standard, printData, { companyProfile })).toContain('document-shell');
        const quotation = { ...templateFor('elegant'), category: 'Quotation' };
        expect(generateDocumentPrintHtml(quotation, printData, { companyProfile })).toContain('document-shell');
    });

    it.each(SALES_INVOICE_LAYOUT_STYLES.map((style) => style.id))('%s: every section toggle removes something', (layoutStyle) => {
        // Data rich enough that every toggle has something to hide.
        const richData = {
            ...printData,
            items: [
                { ...printData.items[0], unit: 'PCS', desc: 'Annual seat licence' },
                { ...printData.items[1], unit: 'PCS', disc: 10, discountAmount: 50, taxAmt: 22.5, taxableAmount: 450, total: 472.5 }
            ],
            totals: {
                ...printData.totals, taxableAmount: 2450, tax: 122.5, grandTotal: 2580, deliveryCharge: 7.5, roundOff: 0.25,
                itemDiscountAmount: 50, footerDiscountAmount: 0
            },
            customer: { ...printData.customer, email: 'ap@greenmart.ae', shippingAddress: 'Warehouse 7' },
            meta: { ...printData.meta, dueDate: '2026-11-04', paymentTerm: 'Net 30', poNumber: 'PO-1', amountPaid: 500, location: 'Dubai Main' }
        };
        const options = {
            companyProfile: { ...companyProfile, crn: 'CN-1', email: 'a@acme.ae', phone: '+971 4 000', logoUrl: 'https://example.com/logo.png', bankName: 'ENBD' },
            qrCodeDataUrl: 'data:image/png;base64,AAAA'
        };
        const toggles = STYLED_INVOICE_SECTIONS[layoutStyle].flatMap(([, rows]) => rows.map(([key]) => key));
        const allOn = { tagline: 'SMART RETAIL', ...Object.fromEntries(toggles.map((key) => [key, true])) };
        const baseline = generateDocumentPrintHtml(templateFor(layoutStyle, allOn), richData, options);

        const inert = toggles.filter((key) =>
            generateDocumentPrintHtml(templateFor(layoutStyle, { ...allOn, [key]: false }), richData, options) === baseline);
        expect(inert).toEqual([]);
    });

    it.each(SALES_INVOICE_LAYOUT_STYLES.map((style) => style.id))('%s: the saved template prints exactly what the designer previews', (layoutStyle) => {
        const settings = { ...defaultStyledInvoiceSettings(layoutStyle), accentColor: '#1d4ed8', showNotes: false };
        // Shape StyledInvoiceDesigner previews with.
        const designerTemplate = {
            category: 'Sales Invoice', name: 'X', templateType: 'FULL', paperSize: 'A4', orientation: 'Portrait',
            columns: '{}', termsContent: settings.termsText,
            displayOptions: JSON.stringify({ salesDesigner: 'document', salesDesignerSettings: settings })
        };
        // Shape PrintEmailTemplates.buildPayload stores (and SalesInvoice prints):
        // extra display options and a populated column map ride along.
        const savedTemplate = {
            ...designerTemplate, id: 41, isDefault: true,
            columns: JSON.stringify({ productId: true, description: true, qty: true, unitPrice: true, tax: true, total: true, discount: true }),
            displayOptions: JSON.stringify({
                showLogo: true, showCompanyDetails: true, showCustomerDetails: true, showTerms: true, showItemImage: false,
                currencyDisplay: 'symbol', primaryColor: '#1d4ed8', accentColor: '#1d4ed8',
                salesDesigner: 'document', salesDesignerSettings: settings
            })
        };
        const options = { companyProfile, qrCodeDataUrl: 'data:image/png;base64,AAAA' };
        expect(generateDocumentPrintHtml(savedTemplate, printData, options))
            .toBe(generateDocumentPrintHtml(designerTemplate, printData, options));
    });

    it.each(SALES_INVOICE_LAYOUT_STYLES.map((style) => style.id))('%s: every section colour changes the print', (layoutStyle) => {
        const richData = {
            ...printData,
            items: [
                { ...printData.items[0], unit: 'PCS', desc: 'Annual seat licence' },
                { ...printData.items[1], disc: 10, discountAmount: 50, taxAmt: 22.5, taxableAmount: 450, total: 472.5 }
            ],
            totals: { ...printData.totals, taxableAmount: 2450, tax: 122.5, grandTotal: 2572.5, itemDiscountAmount: 50, footerDiscountAmount: 0 },
            meta: { ...printData.meta, dueDate: '2026-11-04', paymentTerm: 'Net 30', poNumber: 'PO-1', amountPaid: 500 }
        };
        // No logo URL, so the coloured logo placeholder is drawn.
        const options = { companyProfile: { ...companyProfile, email: 'a@acme.ae', phone: '+971 4 000' }, qrCodeDataUrl: 'data:image/png;base64,AAAA' };
        const toggles = STYLED_INVOICE_SECTIONS[layoutStyle].flatMap(([, rows]) => rows.map(([key]) => key));
        const allOn = { tagline: 'SMART RETAIL', ...Object.fromEntries(toggles.map((key) => [key, true])) };
        const baseline = generateDocumentPrintHtml(templateFor(layoutStyle, allOn), richData, options);

        const slots = STYLED_INVOICE_COLORS[layoutStyle].flatMap(([, rows]) => rows.map(([key]) => key));
        const inert = slots.filter((key) => {
            const html = generateDocumentPrintHtml(templateFor(layoutStyle, { ...allOn, [key]: '#a1b2c3' }), richData, options);
            return html === baseline || !html.includes('#a1b2c3');
        });
        expect(inert).toEqual([]);
    });

    it('ignores a section colour that is not a hex value', () => {
        const safe = render('column-bilingual');
        expect(render('column-bilingual', { colorTitleBg: 'red;background:url(x)' })).toBe(safe);
    });

    it('keeps accent-following slots on the accent until they are set', () => {
        const colors = resolveStyledInvoiceColors('column-bilingual', { accentColor: '#1d4ed8', colorLogoMark: '#ff0000' });
        expect(colors.colorCompanyName).toBe('#1d4ed8');
        expect(colors.colorLogoMark).toBe('#ff0000');
        expect(colors.colorTableHeadText).toBe(colors.colorText);
    });

    it('keeps sections of a template saved before the toggle existed', () => {
        const legacy = templateFor('minimal-bilingual');
        const stored = JSON.parse(legacy.displayOptions).salesDesignerSettings;
        delete stored.showFooterNote;
        legacy.displayOptions = JSON.stringify({ salesDesignerSettings: stored });
        expect(generateDocumentPrintHtml(legacy, printData, { companyProfile })).toContain('issued electronically');
    });

    it('shows paid amount and balance when the invoice is part-paid', () => {
        const html = render('elegant', {}, { ...printData, meta: { ...printData.meta, amountPaid: 625 } });
        expect(html).toContain('AED 625.00');
        expect(html).toContain('AED 2,000.00');
    });
});
