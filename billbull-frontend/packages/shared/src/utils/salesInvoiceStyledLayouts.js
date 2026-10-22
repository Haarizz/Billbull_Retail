// Styled Sales Invoice layouts — Minimal Bilingual, Column Based Bilingual and
// Elegant. A Sales Invoice template opts in by storing `layoutStyle` in its
// salesDesignerSettings; documentTemplateRenderer then routes print, PDF and
// email here instead of the standard document builder.
//
// This is the ONLY renderer for these layouts: StyledInvoiceDesigner previews
// by calling the real print pipeline with sample data, so there is no second
// React preview to keep in sync by hand.
//
// Input is the normalised sales layout (normaliseSalesDesignerLayout) plus the
// raw print data for the fields that layout does not carry (date, payment mode,
// delivery-note / PO refs, ship-to).
import { INTER_REGULAR_B64, INTER_BOLD_B64 } from './interFontBase64';
import { resolveCurrencyDisplayConfig } from './countryCurrencyOptions';

export const SALES_INVOICE_LAYOUT_STYLES = [
    {
        id: 'minimal-bilingual',
        label: 'Minimal · Bilingual',
        description: 'Clean English / Arabic invoice with seller and buyer cards and a verification QR'
    },
    {
        id: 'column-bilingual',
        label: 'Column Based · Bilingual',
        description: 'Ruled-grid English / Arabic tax invoice with full VAT columns and signatures'
    },
    {
        id: 'elegant',
        label: 'Elegant',
        description: 'Understated English invoice with a balance-due headline and three address blocks'
    }
];

const STYLE_IDS = new Set(SALES_INVOICE_LAYOUT_STYLES.map((style) => style.id));

export const getSalesInvoiceLayoutStyle = (settings) =>
    (settings && STYLE_IDS.has(settings.layoutStyle) ? settings.layoutStyle : '');

export const salesInvoiceLayoutStyleMeta = (id) =>
    SALES_INVOICE_LAYOUT_STYLES.find((style) => style.id === id) || null;

// Every section / field a layout can show, grouped as the designer lists them:
// [settingKey, label, defaultOn = true]. The invoice number, the item table and
// the grand total are not listed — they always print.
//
// VAT: these toggles never use colVAT / showVATTotal. Those two are set by
// applyTaxAwareDisplayOptions on a no-tax invoice and act as a master switch
// over the VAT toggles below (see buildView().showVat).
export const STYLED_INVOICE_SECTIONS = {
    'minimal-bilingual': [
        ['Header', [
            ['showLogo', 'Company Logo'],
            ['showCompanyName', 'Company Name'],
            ['showCompanyLocalName', 'Arabic Company Name'],
            ['showArabicTitle', 'Arabic Title']
        ]],
        ['Invoice Details', [
            ['showInvoiceMeta', 'Invoice Details Bar'],
            ['showDocDate', 'Date of Issue'],
            ['showDueDate', 'Due Date']
        ]],
        ['Seller Card', [
            ['showSellerInfo', 'Seller Information'],
            ['showSellerName', 'Name'],
            ['showCRN', 'CR Number'],
            ['showTRN', 'VAT Number'],
            ['showBranch', 'Branch'],
            ['showCompanyAddress', 'Address']
        ]],
        ['Buyer Card', [
            ['showBuyerInfo', 'Buyer Information'],
            ['showCustomerName', 'Name'],
            ['showCustomerAddress', 'Address'],
            ['showCustomerTRN', 'VAT Number'],
            ['showCustomerContact', 'Contact']
        ]],
        ['Items', [
            ['showItemLocalName', 'Arabic Item Names'],
            ['showItemDetails', 'Item Descriptions'],
            ['showOrderHeading', 'Order Details Heading'],
            ['showUnit', 'Units'],
            ['showUnitPrice', 'Unit Price Column']
        ]],
        ['Totals', [
            ['showSubtotal', 'Subtotal'],
            ['showDiscountTotal', 'Discount'],
            ['showTaxableTotal', 'Taxable Amount'],
            ['showVatRow', 'VAT'],
            ['showDeliveryCharge', 'Delivery Charge'],
            ['showRoundOff', 'Round Off'],
            ['showAmountInWords', 'Amount in Words']
        ]],
        ['Footer', [
            ['showQRCode', 'Verification QR Code'],
            ['showPaymentInfo', 'Payment Section'],
            ['showPaymentMethod', 'Payment Method'],
            ['showPaymentStatus', 'Payment Status'],
            ['showBalanceDue', 'Balance Due'],
            ['showNotes', 'Notes'],
            ['showTerms', 'Terms'],
            ['showFooterNote', 'Issued-electronically Note']
        ]]
    ],
    'column-bilingual': [
        ['Header', [
            ['showLogo', 'Company Logo'],
            ['showCompanyLocalName', 'Arabic Company Name'],
            ['showCompanyName', 'Company Name'],
            ['showTagline', 'Tagline'],
            ['showCompanyAddress', 'Company Address'],
            ['showArabicTitle', 'Arabic Title'],
            ['showTRN', 'TRN Line']
        ]],
        ['Customer Grid', [
            ['showCustomerDetails', 'Customer Details Grid'],
            ['showCustomerName', 'Customer Name'],
            ['showCustomerAddress', 'Address / Phone'],
            ['showCustomerTRN', 'Customer TRN'],
            ['showDeliveryNoteRef', 'DN No.'],
            ['showDocDate', 'Invoice Date'],
            ['showPaymentMode', 'Pay Mode'],
            ['showPORef', 'LPO No.']
        ]],
        ['Item Columns', [
            ['showItemLocalName', 'Arabic Item Names'],
            ['showItemDetails', 'Item Descriptions'],
            ['showUnit', 'Units'],
            ['showSlNoColumn', 'Sl. No'],
            ['showPriceColumn', 'Price'],
            ['showGrossColumn', 'Amount'],
            ['showDiscountColumn', 'Discount'],
            ['showTaxableColumn', 'Taxable Amount'],
            ['showVatColumns', 'VAT % & VAT Amount']
        ]],
        ['Summary', [
            ['showRemarks', 'Remarks'],
            ['showSubtotal', 'Sub Total'],
            ['showDiscountTotal', 'Total Discount'],
            ['showTaxableTotal', 'Total Excl. of VAT'],
            ['showVatRow', 'VAT'],
            ['showDeliveryCharge', 'Delivery Charge'],
            ['showRoundOff', 'Round Off'],
            ['showAmountInWords', 'Amount in Words'],
            ['showPaymentSummary', 'Paid / Balance Due'],
            ['showTerms', 'Terms & Conditions']
        ]],
        ['Footer', [
            ['showSignature', 'Signature Lines'],
            ['showThankYou', 'Footer Message'],
            ['showContactLine', 'Contact Line']
        ]]
    ],
    elegant: [
        ['Header', [
            ['showLogo', 'Logo'],
            ['showBalanceHeadline', 'Balance Due Headline']
        ]],
        ['Invoice Fields', [
            ['showDocDate', 'Date'],
            ['showDueDate', 'Due Date'],
            ['showPaymentTerms', 'Payment Terms'],
            ['showPORef', 'PO Number']
        ]],
        ['Addresses', [
            ['showCompanyDetails', 'Billed From'],
            ['showTRN', 'Company TRN', false],
            ['showCustomerDetails', 'Bill To'],
            ['showCustomerTRN', 'Customer TRN', false],
            ['showShipTo', 'Ship To']
        ]],
        ['Items', [
            ['showItemDetails', 'Item Descriptions'],
            ['showUnit', 'Units'],
            ['showUnitPrice', 'Unit Price Column']
        ]],
        ['Totals', [
            ['showSubtotal', 'Subtotal'],
            ['showDiscountTotal', 'Discount'],
            ['showVatRow', 'Tax'],
            ['showDeliveryCharge', 'Shipping'],
            ['showRoundOff', 'Round Off'],
            ['showAmountPaid', 'Amount Paid'],
            ['showBalanceDue', 'Balance Due'],
            ['showAmountInWords', 'Amount in Words']
        ]],
        ['Footer', [
            ['showTerms', 'Terms'],
            ['showBankDetails', 'Payment Details'],
            ['showNotes', 'Notes']
        ]]
    ]
};

// Per-section colours, grouped as the designer lists them:
// [settingKey, label, default]. A default is a hex colour, 'accent' (follows the
// template's accent colour) or 'text' (follows the layout's colorText slot).
// A slot the template never set keeps following its default, so templates
// saved before these existed print exactly as before.
export const STYLED_INVOICE_COLORS = {
    'minimal-bilingual': [
        ['Page', [
            ['colorText', 'Body Text', '#111827'],
            ['colorMutedText', 'Secondary Text', '#374151'],
            ['colorLabel', 'Field Labels', '#6b8fa0'],
            ['colorBorder', 'Borders & Dividers', '#e2e8f0']
        ]],
        ['Header', [
            ['colorCompanyName', 'Company Name', 'text'],
            ['colorCompanyLocalName', 'Arabic Company Name', '#374151'],
            ['colorTitle', 'Invoice Title', 'accent'],
            ['colorArabicTitle', 'Arabic Title', '#6b8fa0'],
            ['colorMetaValue', 'Invoice Details Values', 'text']
        ]],
        ['Seller & Buyer Cards', [
            ['colorCardBg', 'Card Background', '#ffffff'],
            ['colorSectionHeading', 'Card & Order Headings', '#6b8fa0']
        ]],
        ['Item Table', [
            ['colorTableHeadBg', 'Header Background', '#f8fafc'],
            ['colorTableHeadText', 'Header Text', 'text'],
            ['colorItemDetails', 'Arabic Names & Descriptions', '#64748b']
        ]],
        ['Totals', [
            ['colorGrandTotal', 'Grand Total Amount', 'accent'],
            ['colorNegative', 'Discount / Negative Values', '#b91c1c']
        ]],
        ['Footer', [
            ['colorDashedBorder', 'QR & Notes Border', '#c9d4db']
        ]]
    ],
    'column-bilingual': [
        ['Page', [
            ['colorText', 'Body Text', '#17191d'],
            ['colorRule', 'Grid Lines & Borders', '#d5d8dc']
        ]],
        ['Header', [
            ['colorCompanyName', 'Company Name', 'accent'],
            ['colorCompanyLocalName', 'Arabic Company Name', '#282c31'],
            ['colorLogoMark', 'Logo Placeholder', 'accent'],
            ['colorTaglineBg', 'Tagline Background', '#26343c'],
            ['colorTaglineText', 'Tagline Text', '#ffffff'],
            ['colorCompanyAddress', 'Company Address', '#656d75']
        ]],
        ['Title Bar', [
            ['colorTitleBg', 'Background', '#ffffff'],
            ['colorTitleText', 'Title & TRN Text', 'text']
        ]],
        ['Customer Grid', [
            ['colorGridLabelBg', 'Label Background', '#ffffff'],
            ['colorGridLabelText', 'Label Text', 'text'],
            ['colorGridValueText', 'Value Text', 'text']
        ]],
        ['Item Table', [
            ['colorTableHeadBg', 'Header Background', '#ffffff'],
            ['colorTableHeadText', 'Header Text', 'text'],
            ['colorTableText', 'Row Text', 'text'],
            ['colorItemDetails', 'Item Description Notes', '#70777f']
        ]],
        ['Summary', [
            ['colorTotalsText', 'Totals Text', 'text'],
            ['colorGrandTotalBg', 'Grand Total Background', '#ffffff'],
            ['colorGrandTotalText', 'Grand Total Text', 'text']
        ]],
        ['Footer', [
            ['colorThankYou', 'Footer Message', 'text'],
            ['colorFooterText', 'Signatures & Contact', 'text'],
            ['colorSignatureLine', 'Signature Lines', '#b9bec4']
        ]]
    ],
    elegant: [
        ['Page', [
            ['colorText', 'Body Text', '#080808'],
            ['colorMutedText', 'Secondary Text', '#555555']
        ]],
        ['Header', [
            ['colorTitle', 'Invoice Title', 'text'],
            ['colorLogoMark', 'Logo Placeholder', 'accent'],
            ['colorMetaLabel', 'Field Labels', 'text'],
            ['colorBalanceHeadline', 'Balance Due Headline', 'text']
        ]],
        ['Addresses', [
            ['colorHeading', 'Headings', 'text']
        ]],
        ['Item Table', [
            ['colorTableRule', 'Header Underline', 'accent'],
            ['colorTableHeadText', 'Header Text', 'text'],
            ['colorRowDivider', 'Row Dividers', '#e5e5e5']
        ]],
        ['Totals', [
            ['colorTotalsDivider', 'Row Dividers', '#dedede'],
            ['colorBalanceDue', 'Balance Due', 'text']
        ]]
    ]
};

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

// Colours are written straight into inline styles, so anything that is not a
// plain hex value is ignored rather than trusted.
const safeColor = (value) => {
    const trimmed = text(value).trim();
    return HEX_COLOR.test(trimmed) ? trimmed : '';
};

// Effective colour of every slot in a layout: the template's own choice, else
// the slot's default. colorText resolves first so 'text' defaults can follow it.
export const resolveStyledInvoiceColors = (layoutStyle, settings = {}, accentColor = '') => {
    const accent = safeColor(accentColor) || safeColor(settings.accentColor) || STYLE_DEFAULTS[layoutStyle]?.accentColor || '#111827';
    const slots = (STYLED_INVOICE_COLORS[layoutStyle] || []).flatMap(([, entries]) => entries);
    const resolved = {};
    const resolve = ([key, , fallback]) => {
        const own = safeColor(settings[key]);
        if (own) return own;
        if (fallback === 'accent') return accent;
        if (fallback === 'text') return resolved.colorText || '#111827';
        return fallback;
    };
    slots.filter(([key]) => key === 'colorText').forEach((slot) => { resolved[slot[0]] = resolve(slot); });
    slots.filter(([key]) => key !== 'colorText').forEach((slot) => { resolved[slot[0]] = resolve(slot); });
    return resolved;
};

const sectionDefaults = (layoutStyle) => Object.fromEntries(
    (STYLED_INVOICE_SECTIONS[layoutStyle] || [])
        .flatMap(([, toggles]) => toggles)
        .map(([key, , defaultOn = true]) => [key, defaultOn])
);

const STYLE_DEFAULTS = {
    'minimal-bilingual': {
        accentColor: '#0f766e',
        fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif"
    },
    'column-bilingual': {
        accentColor: '#0f766e',
        fontFamily: "Arial, 'Helvetica Neue', sans-serif",
        // Also drives QR generation in printGenerator; this layout has no QR slot.
        showQRCode: false,
        tagline: '',
        thankYouText: 'Thank You For Your Business!'
    },
    elegant: {
        accentColor: '#080808',
        fontFamily: 'Arial, Helvetica, sans-serif',
        showQRCode: false
    }
};

export const defaultStyledInvoiceSettings = (layoutStyle, templateName) => ({
    templateName: templateName || salesInvoiceLayoutStyleMeta(layoutStyle)?.label || 'Sales Invoice',
    layoutStyle,
    docType: 'sales-invoice',
    // These layouts are drawn for an A4 portrait sheet only.
    paperSize: 'A4',
    orientation: 'portrait',
    paperLocked: true,
    termsText: 'Payment is due within the agreed credit terms. Please use the invoice number as your payment reference.',
    ...sectionDefaults(layoutStyle),
    ...(STYLE_DEFAULTS[layoutStyle] || {})
});

// ── helpers ──────────────────────────────────────────────────────────────────

const AR_FONT = "Tahoma, 'Segoe UI', 'Noto Naskh Arabic', 'Noto Sans Arabic', 'DejaVu Sans', Arial, sans-serif";
const MONO_FONT = "'DM Mono', 'Roboto Mono', Consolas, monospace";

const text = (value) => (value === null || value === undefined ? '' : String(value));

const esc = (value) =>
    text(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const escLines = (value) => esc(value).replace(/\r?\n/g, '<br/>');

const isOff = (value) => value === false || value === 'false' || value === 0 || value === '0';

const num = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value) =>
    num(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const qtyText = (value) => {
    const parsed = num(value);
    return Number.isInteger(parsed)
        ? String(parsed)
        : parsed.toLocaleString('en-US', { maximumFractionDigits: 3 });
};

const firstOf = (...values) => values.map((value) => text(value).trim()).find(Boolean) || '';

const ar = (value, style = '') =>
    (value ? `<span lang="ar" dir="rtl" style="font-family:${AR_FONT};${style}">${esc(value)}</span>` : '');

const AR_TITLES = [
    [/tax\s*credit\s*note/i, 'إشعار دائن ضريبي'],
    [/tax\s*invoice/i, 'فاتورة ضريبية'],
    [/sales\s*invoice/i, 'فاتورة مبيعات'],
    [/invoice/i, 'فاتورة']
];

const AR_PAYMENT_MODES = {
    cash: 'نقدي',
    card: 'بطاقة',
    credit: 'آجل',
    'credit card': 'بطاقة ائتمان',
    'bank transfer': 'تحويل بنكي',
    bank: 'تحويل بنكي',
    cheque: 'شيك',
    check: 'شيك',
    online: 'دفع إلكتروني',
    mixed: 'مختلط'
};

const AR_STATUSES = {
    paid: 'مدفوعة',
    unpaid: 'غير مدفوعة',
    'partially paid': 'مدفوعة جزئياً',
    partial: 'مدفوعة جزئياً',
    pending: 'قيد الانتظار',
    draft: 'مسودة',
    posted: 'مرحّلة',
    overdue: 'متأخرة',
    cancelled: 'ملغاة',
    completed: 'مكتملة'
};

const arabicFor = (dictionary, value) => dictionary[text(value).trim().toLowerCase().replace(/_/g, ' ')] || '';

const arabicTitle = (title) => AR_TITLES.find(([pattern]) => pattern.test(title))?.[1] || '';

const initialsOf = (name) =>
    text(name)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0].toUpperCase())
        .join('');

const fontFaceCss = (fontFamily, renderTarget) => {
    // Email clients ignore (or strip) embedded fonts, and a base64 font would
    // bloat every message — only print/PDF get the bundled Inter.
    if (renderTarget === 'email' || !/\bInter\b/i.test(fontFamily)) return '';
    return `
        @font-face { font-family: 'Inter'; font-style: normal; font-weight: 400; src: url('data:font/woff2;base64,${INTER_REGULAR_B64}') format('woff2'); }
        @font-face { font-family: 'Inter'; font-style: normal; font-weight: 700; src: url('data:font/woff2;base64,${INTER_BOLD_B64}') format('woff2'); }
    `;
};

// Vertical page margin lives in @page so continuation sheets get it too; on
// screen (print preview window, designer iframe) the same space is padded in so
// the sheet still reads as a full A4.
const PAGE_MARGIN_MM = 12;

const pageCss = (renderTarget) => (renderTarget === 'email'
    ? `
        body { margin: 0; background: #f3f4f6; }
        .bb-page { max-width: 210mm; margin: 0 auto; padding-top: 28px; padding-bottom: 28px; }
    `
    : `
        @page { size: A4 portrait; margin: ${PAGE_MARGIN_MM}mm 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        .bb-page { width: 210mm; min-height: ${297 - PAGE_MARGIN_MM * 2 - 1}mm; }
        @media screen {
            html { background: #e5e7eb; }
            .bb-page { min-height: 297mm; padding-top: ${PAGE_MARGIN_MM}mm !important; padding-bottom: ${PAGE_MARGIN_MM}mm !important; margin: 0 auto; background: #fff; }
        }
    `);

const documentShell = ({ documentTitle, fontFamily, renderTarget, body }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(documentTitle)}</title>
<style>
${fontFaceCss(fontFamily, renderTarget)}
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
${pageCss(renderTarget)}
table { border-collapse: collapse; }
thead { display: table-header-group; }
tr, .bb-keep { break-inside: avoid; page-break-inside: avoid; }
p, h1, h2, h3, dl, dd { margin: 0; }
</style>
</head>
<body>
${body}
</body>
</html>`;

// ── shared view model ────────────────────────────────────────────────────────

const buildView = ({ layout, data, settings, amountInWords }) => {
    const meta = data.meta || {};
    const totals = layout.totals || {};
    const company = layout.company || {};
    const party = layout.party || {};
    const customer = data.customer || {};

    const hasSeparateDiscounts = totals.itemDiscountAmount !== undefined || totals.footerDiscountAmount !== undefined;
    const discount = hasSeparateDiscounts
        ? num(totals.itemDiscountAmount) + num(totals.footerDiscountAmount)
        : num(totals.billDiscountAmount);
    const subTotal = num(totals.subTotal);
    const taxable = totals.taxableAmount !== undefined ? num(totals.taxableAmount) : subTotal - discount;
    const grandTotal = num(totals.grandTotal);
    const amountPaid = num(totals.amountPaid) || num(meta.amountPaid);
    const balanceDue = num(totals.balanceDue) > 0 ? num(totals.balanceDue) : Math.max(grandTotal - amountPaid, 0);

    const items = (layout.items || []).map((item) => {
        const name = firstOf(item.name, item.description?.title, '-');
        const details = (item.description?.details || [])
            .map(text)
            .filter((line) => line && line.trim().toLowerCase() !== name.trim().toLowerCase());
        return {
            name,
            details,
            localName: firstOf(item.localName),
            unit: firstOf(item.unit),
            qty: num(item.qty),
            price: num(item.price),
            gross: num(item.qty) * num(item.price),
            discount: num(item.discountAmount),
            taxable: num(item.taxableAmount),
            taxPercent: num(item.taxPercent),
            tax: num(item.taxAmount),
            total: num(item.total),
            voided: Boolean(item.voided)
        };
    });

    const rates = [...new Set(items.filter((item) => !item.voided && item.taxPercent > 0).map((item) => item.taxPercent))];

    // applyTaxAwareDisplayOptions turns these off for a no-tax SALES INVOICE, so
    // the styled layouts drop VAT and TRN the same way the standard one does.
    // This is a master switch; each layout's own VAT toggles apply underneath.
    const showVat = !isOff(settings.colVAT) && !isOff(settings.showVATTotal);
    const showSellerTrn = !isOff(settings.showTRN) && Boolean(company.trn);
    const currencyConfig = resolveCurrencyDisplayConfig(layout.currency || 'AED');

    return {
        title: firstOf(layout.title, 'Invoice'),
        titleAr: arabicTitle(firstOf(layout.title, 'Invoice')),
        docNo: firstOf(layout.docNo, data.docNo),
        date: firstOf(data.date),
        dueDate: firstOf(meta.dueDate, meta.validTill),
        paymentTerms: firstOf(meta.paymentTerm, meta.paymentTerms),
        poNumber: firstOf(meta.poNumber, meta.lpoNumber),
        deliveryNote: firstOf(meta.linkedDeliveryNote, meta.deliveryNoteNo),
        paymentMode: firstOf(meta.paymentMode),
        status: firstOf(meta.status),
        branch: firstOf(company.branchName, meta.location, meta.branch),
        notes: firstOf(layout.notes, meta.notes),
        terms: firstOf(layout.terms),
        currency: currencyConfig.currency || currencyConfig.label || text(layout.currency),
        amountInWords: text(amountInWords),
        company: {
            name: firstOf(company.companyName, company.name),
            localName: firstOf(company.localName),
            address: firstOf(company.address),
            phone: firstOf(company.phone),
            email: firstOf(company.email),
            website: firstOf(company.website),
            trn: firstOf(company.trn),
            crn: firstOf(company.crn),
            bankName: firstOf(company.bankName, settings.bankName),
            bankAccount: firstOf(company.bankAccountNumber, settings.bankAccount),
            bankIban: firstOf(company.bankIban, settings.bankIBAN),
            bankSwift: firstOf(company.bankSwift, settings.bankSWIFT)
        },
        customer: {
            name: firstOf(party.name),
            localName: firstOf(customer.localName, customer.nameAr, customer.arabicName),
            code: firstOf(party.code),
            address: firstOf(party.address),
            shippingAddress: firstOf(customer.shippingAddress, meta.shipToAddress, meta.shippingAddress),
            phone: firstOf(party.phone),
            email: firstOf(party.email),
            trn: firstOf(party.taxId)
        },
        logoUrl: firstOf(layout.logoUrl),
        qrCodeDataUrl: firstOf(layout.qrCodeDataUrl),
        items,
        vatRateText: rates.length === 1 ? `${qtyText(rates[0])}%` : '',
        vatLabel: rates.length === 1 ? `VAT ${qtyText(rates[0])}%` : 'VAT',
        showVat,
        showSellerTrn,
        totals: {
            subTotal,
            discount,
            taxable,
            tax: num(totals.tax),
            deliveryCharge: num(totals.deliveryCharge),
            roundOff: num(totals.roundOff),
            voidedTotal: num(totals.voidedTotal),
            voidedCount: num(totals.voidedCount),
            grandTotal,
            amountPaid,
            balanceDue
        }
    };
};

const voidTag = (item) =>
    (item.voided ? ' <span style="font-size:9px;font-weight:700;color:#b91c1c;border:1px solid #fca5a5;border-radius:3px;padding:0 3px;">VOID</span>' : '');

const voidStyle = (item) => (item.voided ? 'text-decoration:line-through;color:#9ca3af;' : '');

// ── Minimal · Bilingual ──────────────────────────────────────────────────────

const renderMinimalBilingual = (view, settings, theme) => {
    const ff = theme.fontFamily;
    const col = theme.colors;
    const LABEL = col.colorLabel;
    const DARK = col.colorText;
    const MID = col.colorMutedText;
    const BORDER = col.colorBorder;
    const on = (key) => !isOff(settings[key]);
    const cur = esc(view.currency);
    const { company, customer, totals } = view;
    const showLocalCompany = on('showCompanyLocalName') && company.localName && company.localName !== company.name;

    const label = (en, arText) =>
        `<div style="font-size:10px;color:${LABEL};margin-bottom:2px;">${esc(en)}${arText ? ` / ${ar(arText)}` : ''}</div>`;

    const field = (en, arText, value, valueAr = '', mono = false) => (value ? `
        <div class="bb-keep" style="margin-bottom:6px;">
            ${label(en, arText)}
            <div style="font-size:12px;font-weight:600;color:${DARK};line-height:1.4;${mono ? `font-family:${MONO_FONT};` : ''}">${escLines(value)}</div>
            ${valueAr ? `<div lang="ar" dir="rtl" style="font-size:11px;color:${MID};font-family:${AR_FONT};margin-top:1px;line-height:1.4;">${esc(valueAr)}</div>` : ''}
        </div>` : '');

    const cardHead = (en, arText) => `
        <div style="font-size:11px;color:${col.colorSectionHeading};font-weight:600;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid ${BORDER};">
            ${esc(en)} / ${ar(arText)}
        </div>`;

    const seller = on('showSellerInfo') ? `
        <div style="border:1px solid ${BORDER};border-radius:8px;padding:10px 16px 4px;background:${col.colorCardBg};">
            ${cardHead('Seller Information', 'معلومات البائع')}
            ${on('showSellerName') ? field('Name', 'الاسم', company.name, showLocalCompany ? company.localName : '') : ''}
            ${on('showCRN') ? field('CR Number', 'رقم السجل التجاري', company.crn, '', true) : ''}
            ${view.showSellerTrn ? field('VAT Number', 'الرقم الضريبي', company.trn, '', true) : ''}
            ${on('showBranch') ? field('Branch', 'الفرع', view.branch) : ''}
            ${on('showCompanyAddress') ? field('Address', 'العنوان', company.address) : ''}
        </div>` : '';

    const buyer = on('showBuyerInfo') ? `
        <div style="border:1px solid ${BORDER};border-radius:8px;padding:10px 16px 4px;background:${col.colorCardBg};">
            ${cardHead('Buyer Information', 'معلومات المشتري')}
            ${on('showCustomerName') ? field('Name', 'الاسم', customer.name, customer.localName) : ''}
            ${on('showCustomerAddress') ? field('Address', 'العنوان', customer.address) : ''}
            ${view.showVat && on('showCustomerTRN') ? field('VAT Number', 'الرقم الضريبي', customer.trn, '', true) : ''}
            ${on('showCustomerContact') ? field('Contact', 'التواصل', [customer.phone, customer.email].filter(Boolean).join('\n')) : ''}
        </div>` : '';

    const cards = [seller, buyer].filter(Boolean);

    const metaCells = [
        ['Invoice Number', 'رقم الفاتورة', view.docNo, true],
        ['Date of Issue', 'تاريخ الإصدار', view.date, on('showDocDate')],
        ['Due Date', 'تاريخ الاستحقاق', view.dueDate, on('showDueDate')]
    ].filter(([, , value, visible]) => visible && value);

    const showUnitPrice = on('showUnitPrice');
    const th = (en, arText, right) => `
        <th style="padding:8px 16px;text-align:${right ? 'right' : 'left'};vertical-align:top;font-weight:700;border-bottom:1px solid ${BORDER};background:${col.colorTableHeadBg};">
            <div style="font-size:11px;color:${col.colorTableHeadText};">${esc(en)}</div>
            <div lang="ar" dir="rtl" style="font-size:10px;color:${LABEL};font-family:${AR_FONT};font-weight:400;text-align:${right ? 'right' : 'left'};">${esc(arText)}</div>
        </th>`;

    const rows = view.items.map((item, index) => `
        <tr style="${index < view.items.length - 1 ? 'border-bottom:1px solid #f1f5f9;' : ''}">
            <td style="padding:6px 16px;vertical-align:top;">
                <div style="font-size:12px;font-weight:500;color:${DARK};line-height:1.4;${voidStyle(item)}">${esc(item.name)}${voidTag(item)}</div>
                ${on('showItemLocalName') && item.localName ? `<div lang="ar" dir="rtl" style="font-size:10px;color:${col.colorItemDetails};font-family:${AR_FONT};margin-top:2px;text-align:left;">${esc(item.localName)}</div>` : ''}
                ${on('showItemDetails') ? item.details.map((line) => `<div style="font-size:10px;color:${col.colorItemDetails};margin-top:2px;">${esc(line)}</div>`).join('') : ''}
            </td>
            <td style="padding:6px 16px;vertical-align:top;text-align:right;font-size:12px;color:${DARK};white-space:nowrap;">${esc(qtyText(item.qty))}${on('showUnit') && item.unit ? ` <span style="font-size:10px;color:${LABEL};">${esc(item.unit)}</span>` : ''}</td>
            ${showUnitPrice ? `<td style="padding:6px 16px;vertical-align:top;text-align:right;white-space:nowrap;">
                <div style="font-size:12px;color:${DARK};">${money(item.price)}</div>
                <div style="font-size:10px;color:${LABEL};">${cur}</div>
            </td>` : ''}
            <td style="padding:6px 16px;vertical-align:top;text-align:right;white-space:nowrap;">
                <div style="font-size:12px;font-weight:600;color:${DARK};${voidStyle(item)}">${money(item.gross)}</div>
                <div style="font-size:10px;color:${LABEL};">${cur}</div>
            </td>
        </tr>`).join('');

    const totalRow = (en, arText, value, negative = false) => `
        <div class="bb-keep" style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:7px 0;border-bottom:1px solid ${BORDER};">
            <div>
                <span style="font-size:12px;font-weight:500;color:${MID};">${esc(en)}</span>
                ${ar(arText, `margin-left:8px;font-size:10px;color:${LABEL};`)}
            </div>
            <div style="font-size:13px;font-weight:600;color:${negative ? col.colorNegative : DARK};white-space:nowrap;">${negative ? '- ' : ''}${money(value)} ${cur}</div>
        </div>`;

    const totalRows = [
        on('showSubtotal') ? totalRow('Subtotal', 'المجموع الفرعي', totals.subTotal) : '',
        on('showDiscountTotal') && totals.discount > 0 ? totalRow('Discount', 'الخصم', totals.discount, true) : '',
        view.showVat && on('showTaxableTotal') && Math.abs(totals.taxable - totals.subTotal) > 0.004
            ? totalRow('Taxable Amount (before VAT)', 'المبلغ الخاضع للضريبة', totals.taxable) : '',
        view.showVat && on('showVatRow') ? totalRow(view.vatLabel, 'ضريبة القيمة المضافة', totals.tax) : '',
        on('showDeliveryCharge') && totals.deliveryCharge > 0 ? totalRow('Delivery Charge', 'رسوم التوصيل', totals.deliveryCharge) : '',
        on('showRoundOff') && totals.roundOff !== 0 ? totalRow('Round Off', 'جبر الكسور', totals.roundOff) : '',
        totals.voidedCount > 0 ? totalRow(`Voided Items (${qtyText(totals.voidedCount)})`, 'البنود الملغاة', totals.voidedTotal, true) : ''
    ].join('');

    const showQr = on('showQRCode') && view.qrCodeDataUrl;
    const qr = showQr ? `
        <div class="bb-keep" style="border:1.5px dashed ${col.colorDashedBorder};border-radius:8px;padding:12px;display:flex;flex-direction:column;align-items:center;gap:8px;">
            <img src="${esc(view.qrCodeDataUrl)}" alt="QR code" style="width:104px;height:104px;" />
            <div style="text-align:center;">
                <div style="font-size:11px;font-weight:600;color:${LABEL};">Scan to verify</div>
                <div lang="ar" dir="rtl" style="font-size:10px;color:${LABEL};font-family:${AR_FONT};margin-top:2px;">امسح للتحقق</div>
            </div>
        </div>` : '';

    const paymentAr = arabicFor(AR_PAYMENT_MODES, view.paymentMode);
    const statusAr = arabicFor(AR_STATUSES, view.status);
    const paymentCell = (en, arText, value, valueAr) => (value ? `
        <div>
            ${label(en, arText)}
            <div style="font-size:13px;font-weight:600;color:${DARK};">${esc(value)}${valueAr ? ` / ${ar(valueAr)}` : ''}</div>
        </div>` : '');
    const paymentCells = [
        on('showPaymentMethod') ? paymentCell('Payment Method', 'طريقة الدفع', view.paymentMode, paymentAr) : '',
        on('showPaymentStatus') ? paymentCell('Payment Status', 'حالة الدفع', view.status, statusAr) : '',
        on('showBalanceDue') && totals.amountPaid > 0 ? paymentCell('Balance Due', 'الرصيد المستحق', `${money(totals.balanceDue)} ${view.currency}`, '') : ''
    ].filter(Boolean);

    const notes = on('showNotes') ? view.notes : '';
    const terms = on('showTerms') ? view.terms : '';
    const notesHeading = notes && terms
        ? `Notes &amp; Terms / ${ar('الملاحظات والشروط')}`
        : notes ? `Notes / ${ar('الملاحظات')}` : `Terms / ${ar('الشروط')}`;

    const body = `
<div class="bb-page" style="padding:4px 48px 8px;font-family:${esc(ff)};color:${DARK};display:flex;flex-direction:column;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:16px;border-bottom:1px solid ${BORDER};">
        <div style="display:flex;gap:14px;align-items:flex-start;">
            ${on('showLogo') && view.logoUrl ? `<img src="${esc(view.logoUrl)}" alt="" style="max-height:56px;max-width:120px;object-fit:contain;" />` : ''}
            <div>
                ${on('showCompanyName') ? `<div style="font-size:26px;font-weight:800;letter-spacing:-0.025em;line-height:1.1;color:${col.colorCompanyName};">${esc(company.name)}</div>` : ''}
                ${showLocalCompany ? `<div lang="ar" dir="rtl" style="font-size:14px;color:${col.colorCompanyLocalName};font-family:${AR_FONT};margin-top:5px;line-height:1.4;text-align:left;">${esc(company.localName)}</div>` : ''}
            </div>
        </div>
        <div style="text-align:right;">
            <div style="font-size:22px;font-weight:700;color:${col.colorTitle};line-height:1.15;white-space:nowrap;">${esc(view.title)}</div>
            ${on('showArabicTitle') && view.titleAr ? `<div lang="ar" dir="rtl" style="font-size:15px;font-weight:600;color:${col.colorArabicTitle};font-family:${AR_FONT};margin-top:4px;text-align:right;">${esc(view.titleAr)}</div>` : ''}
        </div>
    </div>

    ${on('showInvoiceMeta') ? `
    <div style="display:grid;grid-template-columns:repeat(${metaCells.length || 1}, 1fr);gap:16px;padding:10px 0;border-bottom:1px solid ${BORDER};">
        ${metaCells.map(([en, arText, value], index) => `
            <div style="text-align:${index === 0 ? 'left' : index === metaCells.length - 1 ? 'right' : 'center'};">
                ${label(en, arText)}
                <div style="font-size:15px;font-weight:700;letter-spacing:0.01em;color:${col.colorMetaValue};">${esc(value)}</div>
            </div>`).join('')}
    </div>` : ''}

    ${cards.length ? `<div style="display:grid;grid-template-columns:${cards.length === 2 ? '1fr 1fr' : '1fr'};gap:16px;margin-top:16px;">${cards.join('')}</div>` : ''}

    <div style="margin-top:18px;">
        ${on('showOrderHeading') ? `<div style="font-size:13px;font-weight:700;color:${col.colorSectionHeading};margin-bottom:8px;">Order Details / ${ar('تفاصيل الطلب')}</div>` : ''}
        <div style="border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">
            <table style="width:100%;">
                <colgroup><col /><col style="width:90px;" />${showUnitPrice ? '<col style="width:115px;" />' : ''}<col style="width:115px;" /></colgroup>
                <thead><tr>
                    ${th('Item Name', 'اسم المنتج', false)}
                    ${th('Quantity', 'الكمية', true)}
                    ${showUnitPrice ? th('Unit Price', 'سعر الوحدة', true) : ''}
                    ${th('Amount', 'المبلغ', true)}
                </tr></thead>
                <tbody>${rows || `<tr><td colspan="4" style="padding:14px 16px;font-size:12px;color:${LABEL};">No items</td></tr>`}</tbody>
            </table>
        </div>
    </div>

    <div class="bb-keep" style="display:grid;grid-template-columns:${showQr ? '190px 1fr' : '1fr'};gap:24px;margin-top:16px;align-items:start;">
        ${qr}
        <div style="display:flex;flex-direction:column;">
            ${totalRows}
            <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0 0;">
                <div>
                    <div style="font-size:14px;font-weight:700;color:${DARK};">Grand Total</div>
                    <div lang="ar" dir="rtl" style="font-size:11px;color:${LABEL};font-family:${AR_FONT};margin-top:2px;text-align:left;">الإجمالي الكلي</div>
                </div>
                <div style="font-size:20px;font-weight:800;color:${col.colorGrandTotal};letter-spacing:-0.01em;white-space:nowrap;">
                    ${money(totals.grandTotal)} <span style="font-size:14px;font-weight:600;color:${LABEL};">${cur}</span>
                </div>
            </div>
            ${on('showAmountInWords') && view.amountInWords ? `<div style="margin-top:6px;font-size:10.5px;color:${MID};text-align:right;">${esc(view.amountInWords)}</div>` : ''}
        </div>
    </div>

    ${on('showPaymentInfo') && paymentCells.length ? `
    <div class="bb-keep" style="display:grid;grid-template-columns:repeat(${paymentCells.length}, 1fr);gap:16px;margin-top:14px;padding-top:12px;border-top:1px solid ${BORDER};">
        ${paymentCells.join('')}
    </div>` : ''}

    ${notes || terms ? `
    <div class="bb-keep" style="margin-top:12px;border:1px dashed ${col.colorDashedBorder};border-radius:8px;padding:10px 16px;">
        <div style="font-size:11px;color:${LABEL};font-weight:600;margin-bottom:8px;">${notesHeading}</div>
        <p style="font-size:11px;color:${MID};line-height:1.65;">${escLines([notes, terms].filter(Boolean).join('\n'))}</p>
    </div>` : ''}

    ${on('showFooterNote') ? `
    <footer class="bb-keep" style="margin-top:auto;padding-top:14px;text-align:center;">
        <div style="width:48px;height:1px;background:${BORDER};margin:0 auto 8px;"></div>
        <p style="font-size:10.5px;color:${LABEL};line-height:1.5;">This invoice was issued electronically by <strong style="color:${DARK};">${esc(company.name)}</strong>.</p>
        <p lang="ar" dir="rtl" style="margin-top:2px;font-size:10.5px;color:${LABEL};font-family:${AR_FONT};line-height:1.5;">تم إصدار هذه الفاتورة إلكترونياً من <strong style="color:${DARK};">${esc(company.localName || company.name)}</strong>.</p>
    </footer>` : ''}
</div>`;

    return body;
};

// ── Column Based · Bilingual ─────────────────────────────────────────────────

const renderColumnBilingual = (view, settings, theme) => {
    // The reference design was drawn 1000px wide; scale it onto the 794px A4 sheet.
    const px = (n) => Math.round(n * 0.794);
    const col = theme.colors;
    const RULE = col.colorRule;
    const on = (key) => !isOff(settings[key]);
    const { company, customer, totals } = view;

    const bi = (en, arText, strong = true) =>
        `${strong ? `<strong>${esc(en)}</strong>` : esc(en)}${arText ? `<span lang="ar" dir="rtl" style="margin-left:${px(5)}px;font-family:${AR_FONT};font-size:0.9em;">${esc(arText)}</span>` : ''}`;

    const brandMark = () => {
        if (!on('showLogo')) return '<div></div>';
        if (view.logoUrl) {
            return `<div style="display:flex;width:${px(150)}px;height:${px(125)}px;align-items:center;justify-content:flex-start;">
                <img src="${esc(view.logoUrl)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;" />
            </div>`;
        }
        return `<div style="display:flex;width:${px(112)}px;height:${px(125)}px;align-items:center;justify-content:center;flex-direction:column;color:${col.colorLogoMark};border:0.5px solid #cfd9d7;border-radius:3px;background:#f5fbfa;">
            <span style="font-size:${px(44)}px;font-weight:800;letter-spacing:0.04em;">${esc(initialsOf(company.name))}</span>
        </div>`;
    };

    const cell = `min-height:${px(34)}px;padding:${px(8)}px ${px(9)}px ${px(6)}px;border-bottom:0.5px solid ${RULE};font-size:${px(13)}px;vertical-align:top;`;
    const labelCell = (en, arText) => `<td style="${cell}border-right:0.5px solid ${RULE};white-space:nowrap;background:${col.colorGridLabelBg};color:${col.colorGridLabelText};">${en ? bi(en, arText) : '&nbsp;'}</td>`;
    const valueCell = (value, last = false) => `<td style="${cell}${last ? '' : `border-right:0.5px solid ${RULE};`}color:${col.colorGridValueText};">${value || '&nbsp;'}</td>`;

    const addressPhone = [
        customer.address ? `<span>${esc(customer.address)}</span>` : '',
        customer.phone ? `<span style="white-space:nowrap;"><strong>Tel.:</strong> ${esc(customer.phone)}</span>` : ''
    ].filter(Boolean).join('<span style="display:inline-block;width:12px;"></span>');

    // Visible cells flow two per row, in the reference design's reading order
    // (left column field, right column field), so hiding one closes the gap.
    const gridCells = [
        ['Customer Name', 'اسم الزبون', esc(customer.name), on('showCustomerName')],
        ['Invoice No.', 'رقم الفاتورة', esc(view.docNo), true],
        ['Address / Phone', 'العنوان', addressPhone, on('showCustomerAddress')],
        ['Invoice Date', 'تاريخ الفاتورة', esc(view.date), on('showDocDate')],
        ['Customer TRN', 'الرقم الضريبي للعميل', esc(customer.trn), view.showVat && on('showCustomerTRN')],
        ['Pay Mode', 'طريقة الدفع', esc(view.paymentMode), on('showPaymentMode')],
        ['DN. No.', 'رقم إشعار التسليم', esc(view.deliveryNote), on('showDeliveryNoteRef')],
        ['LPO No.', 'رقم أمر الشراء', esc(view.poNumber), on('showPORef')]
    ].filter(([, , , visible]) => visible);
    const gridRows = [];
    for (let index = 0; index < gridCells.length; index += 2) {
        const [leftEn, leftAr, leftValue] = gridCells[index];
        const [rightEn = '', rightAr = '', rightValue = ''] = gridCells[index + 1] || [];
        gridRows.push(`<tr>${labelCell(leftEn, leftAr)}${valueCell(leftValue)}${labelCell(rightEn, rightAr)}${valueCell(rightValue, true)}</tr>`);
    }

    const columns = [
        { en: 'Sl. No', ar: 'التسلسل', width: 5.5, align: 'center', show: on('showSlNoColumn'), value: (item, index) => String(index + 1) },
        { en: 'Item Description', ar: 'وصف السلعة', width: 0, align: 'left', value: (item) => `
            <span style="display:block;${voidStyle(item)}">${esc(item.name)}${voidTag(item)}</span>
            ${on('showItemLocalName') && item.localName ? `<span lang="ar" dir="rtl" style="display:block;margin-top:${px(3)}px;font-family:${AR_FONT};font-size:${px(11)}px;text-align:left;">${esc(item.localName)}</span>` : ''}
            ${on('showItemDetails') ? item.details.map((line) => `<small style="display:block;margin-top:${px(4)}px;color:${col.colorItemDetails};font-size:${px(10)}px;line-height:1.3;">${esc(line)}</small>`).join('') : ''}` },
        { en: 'Qty', ar: 'الكمية', width: 7, align: 'center', value: (item) => `${esc(qtyText(item.qty))}${on('showUnit') && item.unit ? ` ${esc(item.unit)}` : ''}` },
        { en: 'Price', ar: 'السعر', width: 7.5, align: 'right', show: on('showPriceColumn'), value: (item) => money(item.price) },
        { en: 'Amount', ar: 'المبلغ', width: 9, align: 'right', show: on('showGrossColumn'), value: (item) => money(item.gross) },
        { en: 'Disc.', ar: 'الخصم', width: 6, align: 'right', show: on('showDiscountColumn'), value: (item) => money(item.discount) },
        { en: 'Taxable Amount', ar: 'المبلغ الخاضع للضريبة', width: 9, align: 'right', show: view.showVat && on('showTaxableColumn'), value: (item) => money(item.taxable) },
        { en: 'VAT %', ar: 'ضريبة', width: 6, align: 'right', show: view.showVat && on('showVatColumns'), value: (item) => `${esc(qtyText(item.taxPercent))}%` },
        { en: 'VAT Amount', ar: 'قيمة الضريبة', width: 8, align: 'right', show: view.showVat && on('showVatColumns'), value: (item) => money(item.tax) },
        { en: 'Total Amount', ar: 'المبلغ الإجمالي', width: 9, align: 'right', value: (item) => money(item.total) }
    ].filter((column) => column.show !== false);

    const lastIndex = columns.length - 1;
    const colgroup = columns.map((column) => (column.width ? `<col style="width:${column.width}%;" />` : '<col />')).join('');
    const headCells = columns.map((column, index) => `
        <th style="padding:${px(7)}px ${px(3)}px;${index < lastIndex ? `border-right:0.5px solid ${RULE};` : ''}border-bottom:0.5px solid ${RULE};text-align:center;line-height:1.16;vertical-align:middle;height:${px(78)}px;background:${col.colorTableHeadBg};color:${col.colorTableHeadText};">
            <strong style="display:block;font-size:${px(12)}px;">${esc(column.en)}</strong>
            <span lang="ar" dir="rtl" style="display:block;margin-top:${px(4)}px;font-family:${AR_FONT};font-size:${px(10)}px;font-weight:600;text-align:center;">${esc(column.ar)}</span>
        </th>`).join('');

    const bodyCell = (column, index, content, extra = '') =>
        `<td style="padding:${px(9)}px ${px(7)}px;${index < lastIndex ? `border-right:0.5px solid ${RULE};` : ''}text-align:${column.align};font-size:${px(12)}px;vertical-align:top;color:${col.colorTableText};${extra}">${content}</td>`;

    const itemRows = view.items.map((item, rowIndex) => `
        <tr>${columns.map((column, index) => bodyCell(column, index, column.value(item, rowIndex), column.align === 'right' ? 'white-space:nowrap;' : '')).join('')}</tr>`).join('');

    // Keeps the ruled columns running down an otherwise short page, like the
    // reference design's fixed-height body. The reference box (535px) was drawn
    // for a margin-less sheet; FILLER_BODY_PX is what is left of the printable A4
    // once the rest of the form is laid out. A line is ~38px with an Arabic name.
    const FILLER_BODY_PX = 300;
    const fillerHeight = Math.max(0, FILLER_BODY_PX - view.items.length * 38);
    const fillerRow = fillerHeight > 0
        ? `<tr>${columns.map((column, index) => bodyCell(column, index, '', `height:${fillerHeight}px;padding:0;`)).join('')}</tr>`
        : '';

    const totalLine = (en, arText, value) => `
        <div style="display:flex;justify-content:flex-end;align-items:baseline;gap:${px(5)}px;min-height:${px(21)}px;text-align:right;color:${col.colorTotalsText};">
            <strong style="font-size:${px(13)}px;">${esc(en)}</strong>
            <span lang="ar" dir="rtl" style="font-family:${AR_FONT};font-size:${px(12)}px;">${esc(arText)}</span>
            <span style="display:inline-block;min-width:80px;margin-left:${px(7)}px;">${value}</span>
        </div>`;

    const totalLines = [
        on('showSubtotal') ? totalLine('Sub Total', 'الإجمالي قبل الضريبة', money(totals.subTotal)) : '',
        on('showDiscountTotal') ? totalLine('Total Discount', 'إجمالي الخصم', money(totals.discount)) : '',
        view.showVat && on('showTaxableTotal') ? totalLine('Total Excl. of VAT', 'المجموع باستثناء ضريبة القيمة المضافة', money(totals.taxable)) : '',
        view.showVat && on('showVatRow') ? totalLine(view.vatLabel, 'ضريبة القيمة المضافة', money(totals.tax)) : '',
        on('showDeliveryCharge') && totals.deliveryCharge > 0 ? totalLine('Delivery Charge', 'رسوم التوصيل', money(totals.deliveryCharge)) : '',
        on('showRoundOff') ? totalLine('Round Off', 'جبر الكسور', money(totals.roundOff)) : '',
        totals.voidedCount > 0 ? totalLine(`Voided Items (${qtyText(totals.voidedCount)})`, 'البنود الملغاة', `- ${money(totals.voidedTotal)}`) : ''
    ].join('');

    const signature = (en, arText) => (on('showSignature') ? `
        <div style="text-align:center;">
            <span style="display:block;width:88%;margin:0 auto ${px(12)}px;border-top:0.5px solid ${col.colorSignatureLine};"></span>
            <p style="white-space:nowrap;font-size:${px(11)}px;color:${col.colorFooterText};">${bi(en, arText)}</p>
        </div>` : '<div></div>');

    const contactLine = on('showContactLine')
        ? [company.email, company.phone].filter(Boolean).map(esc).join('&nbsp;&nbsp;•&nbsp;&nbsp;')
        : '';
    const sep = `<span style="padding:0 ${px(5)}px;color:#9aa1a8;font-weight:400;">|</span>`;
    const tagline = on('showTagline') ? text(settings.tagline).trim() : '';
    const thankYou = on('showThankYou') ? text(settings.thankYouText).trim() : '';
    const showFooter = on('showSignature') || thankYou || contactLine;
    const halfGrid = 'display:grid;grid-template-columns:46% 54%;';

    const body = `
<div class="bb-page" style="padding:0 ${px(20)}px;font-family:${esc(theme.fontFamily)};font-size:${px(13)}px;color:${col.colorText};">
<div style="border:0.5px solid ${RULE};">
    <header class="bb-keep" style="display:grid;grid-template-columns:${px(180)}px 1fr ${px(180)}px;align-items:center;min-height:${px(140)}px;padding:${px(24)}px ${px(48)}px ${px(18)}px;">
        ${brandMark()}
        <div style="text-align:center;">
            ${on('showCompanyLocalName') && company.localName && company.localName !== company.name ? `<p lang="ar" dir="rtl" style="margin:0 0 ${px(4)}px;color:${col.colorCompanyLocalName};font-size:${px(27)}px;font-weight:700;font-family:${AR_FONT};text-align:center;">${esc(company.localName)}</p>` : ''}
            ${on('showCompanyName') ? `<h1 style="margin:0;color:${col.colorCompanyName};font-size:${px(33)}px;font-weight:800;letter-spacing:-0.025em;">${esc(company.name)}</h1>` : ''}
            ${tagline ? `<span style="display:inline-block;margin:${px(9)}px 0 ${px(4)}px;padding:${px(4)}px ${px(13)}px;color:${col.colorTaglineText};background:${col.colorTaglineBg};font-size:${px(9)}px;font-weight:700;letter-spacing:0.16em;">${esc(tagline)}</span>` : ''}
            ${on('showCompanyAddress') && company.address ? `<p style="margin-top:${px(3)}px;color:${col.colorCompanyAddress};font-size:${px(11)}px;">${esc(company.address)}</p>` : ''}
        </div>
        <div></div>
    </header>

    <section class="bb-keep" style="padding:${px(8)}px ${px(20)}px ${px(7)}px;border-top:0.5px solid ${RULE};border-bottom:0.5px solid ${RULE};text-align:center;background:${col.colorTitleBg};color:${col.colorTitleText};">
        <h2 style="font-weight:700;font-size:${px(18)}px;text-transform:uppercase;">${esc(view.title)}${on('showArabicTitle') && view.titleAr ? ` ${sep} ${ar(view.titleAr)}` : ''}</h2>
        ${view.showSellerTrn ? `<p style="font-weight:700;font-size:${px(15)}px;">TRN : ${esc(company.trn)} ${sep} ${ar('رقم التسجيل الضريبي')}</p>` : ''}
    </section>

    ${on('showCustomerDetails') && gridRows.length ? `
    <table class="bb-keep" style="width:100%;table-layout:fixed;">
        <colgroup><col style="width:21%;" /><col style="width:44%;" /><col style="width:20%;" /><col style="width:15%;" /></colgroup>
        <tbody>${gridRows.join('')}</tbody>
    </table>` : ''}

    <table style="width:100%;table-layout:fixed;border-bottom:0.5px solid ${RULE};">
        <colgroup>${colgroup}</colgroup>
        <thead><tr>${headCells}</tr></thead>
        <tbody>${itemRows}${fillerRow}</tbody>
    </table>

    ${on('showRemarks') || totalLines ? `
    <section class="bb-keep" style="${halfGrid}min-height:${px(100)}px;border-bottom:0.5px solid ${RULE};">
        <div style="padding:${px(13)}px ${px(9)}px;border-right:0.5px solid ${RULE};">
            ${on('showRemarks') ? bi('Remarks : -', 'ملاحظات') : ''}
            ${on('showRemarks') && view.notes ? `<p style="margin-top:${px(6)}px;font-size:${px(11)}px;line-height:1.5;">${escLines(view.notes)}</p>` : ''}
        </div>
        <div style="padding:${px(10)}px ${px(9)}px ${px(8)}px;">${totalLines}</div>
    </section>` : ''}

    <section class="bb-keep" style="${halfGrid}min-height:${px(72)}px;border-bottom:0.5px solid ${RULE};">
        <div style="padding:${px(13)}px ${px(11)}px;border-right:0.5px solid ${RULE};">
            ${on('showAmountInWords') ? `
            <p>${bi('Amount in Words', 'المبلغ بالكلمات')} :</p>
            <span style="display:block;margin-top:${px(4)}px;font-size:${px(11)}px;">${esc(view.amountInWords)}</span>` : ''}
        </div>
        <p style="display:flex;align-items:center;justify-content:flex-end;padding:${px(13)}px ${px(10)}px;font-size:${px(14)}px;background:${col.colorGrandTotalBg};color:${col.colorGrandTotalText};">
            ${view.showVat ? bi('Total Incl. of VAT', 'المجموع شامل ضريبة القيمة المضافة') : bi('Total', 'المجموع')}&nbsp;:
            <strong style="margin-left:${px(26)}px;font-size:${px(17)}px;white-space:nowrap;">${esc(view.currency)} ${money(totals.grandTotal)}</strong>
        </p>
    </section>

    ${on('showPaymentSummary') ? `
    <section class="bb-keep" style="${halfGrid}min-height:${px(63)}px;border-bottom:0.5px solid ${RULE};">
        <div style="border-right:0.5px solid ${RULE};"></div>
        <div style="padding:${px(9)}px ${px(10)}px ${px(7)}px;">
            ${totalLine('Paid Amount', 'المبلغ المدفوع', money(totals.amountPaid))}
            ${totalLine('Balance Due', 'الرصيد المستحق', money(totals.balanceDue))}
        </div>
    </section>` : ''}

    ${on('showTerms') && view.terms ? `
    <section class="bb-keep" style="padding:${px(10)}px ${px(11)}px;border-bottom:0.5px solid ${RULE};font-size:${px(11)}px;line-height:1.5;">
        ${bi('Terms & Conditions', 'الشروط والأحكام')}
        <p style="margin-top:${px(4)}px;">${escLines(view.terms)}</p>
    </section>` : ''}

    ${showFooter ? `
    <footer class="bb-keep" style="display:grid;grid-template-columns:1fr 1.2fr 1fr;align-items:end;gap:${px(25)}px;min-height:${px(132)}px;padding:${px(22)}px ${px(25)}px ${px(16)}px;">
        ${signature('Customer Signature', 'توقيع العميل')}
        <div style="text-align:center;">
            ${thankYou ? `<strong style="font-size:${px(14)}px;font-style:italic;color:${col.colorThankYou};">${esc(thankYou)}</strong>` : ''}
            ${contactLine ? `<p style="margin-top:${px(10)}px;padding:${px(7)}px ${px(5)}px;border:0.5px solid ${RULE};border-radius:3px;font-size:${px(11)}px;color:${col.colorFooterText};">${contactLine}</p>` : ''}
        </div>
        ${signature('Authorised Signature', 'توقيع المسؤول')}
    </footer>` : ''}
</div>
</div>`;

    return body;
};

// ── Elegant ──────────────────────────────────────────────────────────────────

const renderElegant = (view, settings, theme) => {
    const col = theme.colors;
    const on = (key) => !isOff(settings[key]);
    const cur = esc(view.currency);
    const amount = (value) => `${cur} ${money(value)}`;
    const { company, customer, totals } = view;
    const body13 = 'font-size:13px;line-height:1.5;';

    const logo = () => {
        if (!on('showLogo')) return '';
        if (view.logoUrl) {
            return `<img src="${esc(view.logoUrl)}" alt="" style="max-height:52px;max-width:180px;object-fit:contain;" />`;
        }
        // Geometric "D" mark from the reference design, scaled 0.65x.
        return `<div style="display:flex;align-items:center;gap:13px;">
            <span style="position:relative;display:block;height:44px;width:34px;flex-shrink:0;">
                <span style="position:absolute;left:0;top:0;height:100%;width:21px;background:${col.colorLogoMark};"></span>
                <span style="position:absolute;right:0;top:9px;height:26px;width:26px;border-radius:50%;background:${col.colorLogoMark};"></span>
                <span style="position:absolute;left:8px;top:9px;height:26px;width:13px;border-top-left-radius:6.5px;border-bottom-left-radius:6.5px;background:#fff;"></span>
            </span>
            <span style="font-size:25px;font-weight:700;line-height:1;letter-spacing:-0.975px;color:${col.colorLogoMark};">${esc(company.name)}</span>
        </div>`;
    };

    const metaRows = [
        ['Date', view.date, on('showDocDate')],
        ['Due Date', view.dueDate, on('showDueDate')],
        ['Payment Terms', view.paymentTerms, on('showPaymentTerms')],
        ['PO Number', view.poNumber, on('showPORef')]
    ].filter(([, value, visible]) => visible && value);

    const lines = (...values) => values.filter(Boolean).map(escLines).join('<br/>');
    const addressBlock = (heading, content, extra = '') => (content ? `
        <div>
            <h3 style="margin:0 0 10px;font-size:13px;font-weight:bold;color:${col.colorHeading};">${esc(heading)}</h3>
            <p>${content}</p>
            ${extra}
        </div>` : '');

    const addresses = [
        on('showCompanyDetails') ? addressBlock(
            'Billed From:',
            lines(company.name, company.address, company.email, company.phone),
            view.showSellerTrn ? `<p style="margin-top:3px;font-size:11px;">TRN: ${esc(company.trn)}</p>` : ''
        ) : '',
        on('showCustomerDetails') ? addressBlock(
            'Bill To:',
            lines(customer.name, customer.address, customer.email, customer.phone),
            view.showVat && on('showCustomerTRN') && customer.trn ? `<p style="margin-top:3px;font-size:11px;">TRN: ${esc(customer.trn)}</p>` : ''
        ) : '',
        on('showShipTo') && customer.shippingAddress ? addressBlock('Ship To:', lines(customer.name, customer.shippingAddress)) : ''
    ].filter(Boolean);

    const itemRows = view.items.map((item, index) => `
        <tr style="${index < view.items.length - 1 ? `border-bottom:1px solid ${col.colorRowDivider};` : ''}">
            <td style="padding:5px 0;vertical-align:top;">
                <span style="${voidStyle(item)}">${esc(item.name)}</span>${voidTag(item)}
                ${on('showItemDetails') ? item.details.map((line) => `<div style="font-size:11px;color:${col.colorMutedText};">${esc(line)}</div>`).join('') : ''}
            </td>
            <td style="padding:5px 0;text-align:right;vertical-align:top;white-space:nowrap;">${esc(qtyText(item.qty))}${on('showUnit') && item.unit ? ` ${esc(item.unit)}` : ''}</td>
            ${on('showUnitPrice') ? `<td style="padding:5px 0;text-align:right;vertical-align:top;white-space:nowrap;">${amount(item.price)}</td>` : ''}
            <td style="padding:5px 0;text-align:right;vertical-align:top;white-space:nowrap;${voidStyle(item)}">${amount(item.gross)}</td>
        </tr>`).join('');

    const totalsRow = (label, value) => `
        <div style="display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid ${col.colorTotalsDivider};padding:2px 0;">
            <dt>${esc(label)}</dt><dd style="white-space:nowrap;">${value}</dd>
        </div>`;

    const totalsRows = [
        on('showSubtotal') ? totalsRow('Subtotal', amount(totals.subTotal)) : '',
        on('showDiscountTotal') && totals.discount > 0 ? totalsRow('Discount:', `−${amount(totals.discount)}`) : '',
        view.showVat && on('showVatRow') ? totalsRow(`Tax${view.vatRateText ? ` (${view.vatRateText})` : ''}:`, amount(totals.tax)) : '',
        on('showDeliveryCharge') && totals.deliveryCharge > 0 ? totalsRow('Shipping:', amount(totals.deliveryCharge)) : '',
        on('showRoundOff') && totals.roundOff !== 0 ? totalsRow('Round Off:', amount(totals.roundOff)) : '',
        totals.voidedCount > 0 ? totalsRow(`Voided Items (${qtyText(totals.voidedCount)}):`, `−${amount(totals.voidedTotal)}`) : '',
        totalsRow('Total:', amount(totals.grandTotal)),
        on('showAmountPaid') ? totalsRow('Amount Paid:', amount(totals.amountPaid)) : ''
    ].join('');

    const bankLines = [
        company.bankName,
        company.bankAccount ? `Account: ${company.bankAccount}` : '',
        company.bankIban ? `IBAN: ${company.bankIban}` : '',
        company.bankSwift ? `SWIFT: ${company.bankSwift}` : ''
    ].filter(Boolean);

    const termsColumn = [
        on('showTerms') && view.terms ? `
            <h3 style="margin:0 0 10px;font-size:13px;font-weight:bold;color:${col.colorHeading};">Terms</h3>
            ${view.terms.split(/\n\s*\n/).map((para, index) => `<p style="${index ? 'margin-top:10px;' : ''}">${escLines(para)}</p>`).join('')}` : '',
        on('showBankDetails') && bankLines.length ? `
            <div style="margin-top:10px;">
                <h3 style="margin:0 0 6px;font-size:13px;font-weight:bold;color:${col.colorHeading};">Payment Details</h3>
                <p style="color:${col.colorMutedText};">${bankLines.map(esc).join('<br/>')}</p>
            </div>` : ''
    ].join('');

    const showHeadline = on('showBalanceHeadline');

    const body = `
<div class="bb-page" style="padding:8px 47px 24px;font-family:${esc(theme.fontFamily)};color:${col.colorText};${body13}">
    <header class="bb-keep" style="display:flex;align-items:flex-start;justify-content:space-between;gap:21px;">
        <div>
            <h1 style="font-size:25px;font-weight:700;line-height:1;letter-spacing:-0.52px;text-transform:uppercase;color:${col.colorTitle};">${esc(view.title)}</h1>
            <p style="margin-top:5px;font-size:14px;line-height:1;">#${esc(view.docNo)}</p>
        </div>
        ${logo()}
    </header>

    ${metaRows.length || showHeadline ? `
    <section class="bb-keep" style="margin-top:26px;">
        ${metaRows.length ? `<dl style="display:grid;grid-template-columns:110px auto;justify-content:start;column-gap:31px;${body13}">
            ${metaRows.map(([label, value]) => `<dt style="font-weight:bold;color:${col.colorMetaLabel};">${esc(label)}</dt><dd>${esc(value)}</dd>`).join('')}
        </dl>` : ''}
        ${showHeadline ? `<h2 style="margin-top:${metaRows.length ? 21 : 0}px;font-size:20px;font-weight:700;line-height:1.25;letter-spacing:-0.26px;color:${col.colorBalanceHeadline};">Balance Due ${amount(totals.balanceDue)}</h2>` : ''}
    </section>` : ''}

    ${addresses.length ? `<section class="bb-keep" style="margin-top:31px;display:grid;grid-template-columns:repeat(3, 1fr);gap:27px;${body13}">${addresses.join('')}</section>` : ''}

    <section style="margin-top:36px;">
        <table style="width:100%;text-align:left;${body13}">
            <thead>
                <tr style="border-bottom:2px solid ${col.colorTableRule};font-size:11px;color:${col.colorTableHeadText};">
                    <th style="padding-bottom:8px;font-weight:bold;text-align:left;">Description</th>
                    <th style="padding-bottom:8px;font-weight:bold;text-align:right;width:70px;">Qty</th>
                    ${on('showUnitPrice') ? '<th style="padding-bottom:8px;font-weight:bold;text-align:right;width:120px;">Unit price</th>' : ''}
                    <th style="padding-bottom:8px;font-weight:bold;text-align:right;width:120px;">Amount</th>
                </tr>
            </thead>
            <tbody>${itemRows}</tbody>
        </table>
    </section>

    <section class="bb-keep" style="margin-top:36px;display:grid;grid-template-columns:1fr 1fr;gap:48px;${body13}">
        <div>${termsColumn}</div>
        <dl>
            ${totalsRows}
            ${on('showBalanceDue') ? `
            <div style="display:flex;justify-content:space-between;gap:16px;padding:3px 0;font-weight:bold;color:${col.colorBalanceDue};">
                <dt>Balance Due:</dt><dd style="white-space:nowrap;">${amount(totals.balanceDue)}</dd>
            </div>` : ''}
            ${on('showAmountInWords') && view.amountInWords ? `<p style="margin-top:6px;font-size:11px;color:${col.colorMutedText};text-align:right;">${esc(view.amountInWords)}</p>` : ''}
        </dl>
    </section>

    ${on('showNotes') && view.notes ? `
    <section class="bb-keep" style="margin-top:33px;${body13}">
        <h3 style="margin:0 0 10px;font-size:13px;font-weight:bold;color:${col.colorHeading};">Notes</h3>
        <p>${escLines(view.notes)}</p>
    </section>` : ''}
</div>`;

    return body;
};

const RENDERERS = {
    'minimal-bilingual': renderMinimalBilingual,
    'column-bilingual': renderColumnBilingual,
    elegant: renderElegant
};

/**
 * @param {object} args
 * @param {string} args.layoutStyle    one of SALES_INVOICE_LAYOUT_STYLES ids
 * @param {object} args.layout         normaliseSalesDesignerLayout() output
 * @param {object} args.data           raw print data (date, meta, customer)
 * @param {object} args.settings       the template's salesDesignerSettings
 * @param {string} args.renderTarget   'print' | 'pdf' | 'email'
 * @param {string} args.amountInWords
 * @param {string} args.documentTitle  <title>, used as the PDF file name
 */
export const renderStyledSalesInvoiceHtml = ({
    layoutStyle,
    layout,
    data = {},
    settings = {},
    renderTarget = 'print',
    amountInWords = '',
    documentTitle = ''
}) => {
    const render = RENDERERS[layoutStyle];
    if (!render) throw new Error(`Unknown sales invoice layout style: ${layoutStyle}`);

    // Defaults first, so a template saved before a toggle existed keeps
    // showing that section.
    const merged = { ...defaultStyledInvoiceSettings(layoutStyle), ...settings };
    const accentColor = safeColor(layout.theme?.accentColor) || safeColor(merged.accentColor) || STYLE_DEFAULTS[layoutStyle].accentColor;
    const theme = {
        accentColor,
        fontFamily: layout.theme?.fontFamily || merged.fontFamily,
        colors: resolveStyledInvoiceColors(layoutStyle, merged, accentColor)
    };
    const view = buildView({ layout, data, settings: merged, amountInWords });

    return documentShell({
        documentTitle: documentTitle || `${view.title} ${view.docNo}`.trim(),
        fontFamily: theme.fontFamily,
        renderTarget,
        body: render(view, merged, theme)
    });
};
