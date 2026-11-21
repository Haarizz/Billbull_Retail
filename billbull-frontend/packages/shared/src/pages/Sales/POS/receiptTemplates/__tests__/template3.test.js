import { describe, it, expect } from 'vitest';
import { buildTemplate3Blocks, mapToTemplate3Data, mapInvoiceToTemplate3Txn, mapEscPosOptsToTemplate3Data } from '../template3Layout';
import { buildTemplate3Html } from '../buildTemplate3Html';
import { buildSampleTxn } from '../billBullTaxInvoiceData';
import { buildSampleInvoice } from '../sampleInvoice';
import { getReceiptTemplate, RECEIPT_TEMPLATES } from '../index';

const outlet = {
  name: 'BillBull Retail OS', trn: '100228723100003', address: 'Office 1204, Business Bay, Dubai, UAE',
  phone: '+971 4 555 0190', footerText: 'Keep bill for Exchange within 7 Days\nThank you for shopping',
  titleEn: 'Tax Invoice', titleAr: 'فاتورة ضريبية',
};
const texts = (blocks) => blocks.flatMap((b) => [b.text, b.l, b.r, ...(b.head || []), ...((b.rows || []).flat())]).filter(Boolean);
const titles = (blocks) => blocks.filter((b) => b.t === 'title').map((b) => b.text);

describe('Template 3 registry entry', () => {
  it('is a selectable component template with every renderer the dispatch sites call', () => {
    const t3 = getReceiptTemplate('billbull-retail-os');
    expect(t3.label).toBe('Template 3');
    expect(t3.kind).toBe('component');
    for (const fn of ['Preview', 'buildHtml', 'mapData', 'mapInvoiceToTxn', 'buildEscPosBase64']) expect(typeof t3[fn]).toBe('function');
    // Template 2 also gained mapInvoiceToTxn, which the generic checkout preview / PDF sites now call.
    for (const t of RECEIPT_TEMPLATES.filter((x) => x.kind === 'component')) expect(typeof t.mapInvoiceToTxn).toBe('function');
  });
});

describe('Template 3 layout', () => {
  const base = { ...buildSampleTxn(), loyalty: { pointsEarned: 90, pointsRedeemed: 0, pointsBalance: 1240 }, taxInclusive: true };

  it('prints the design sections in order with every toggle on', () => {
    const blocks = buildTemplate3Blocks(mapToTemplate3Data(outlet, base, {}));
    expect(titles(blocks)).toEqual(['CREDIT CUSTOMER', 'DELIVERY DETAILS', 'CREDIT BALANCE DETAILS', 'LOYALTY POINTS']);
    const all = texts(blocks);
    expect(all).toContain('TAX INVOICE');
    expect(all).toContain('TRN: 100228723100003');
    expect(all).toContain('Tax inclusive:');
    expect(all).toContain('Points Earned');
    expect(all).toContain('BeforeVAT');
    expect(all).toContain(' Served by: Hari K');
    expect(all).toContain('Keep bill for Exchange within 7 Days');
    expect(all).toContain('Powered by BillBull Retail OS');
    expect(blocks.at(-1)).toEqual({ t: 'barcode', value: 'DI-28-042' });
    // item row: "sku  qty x" / unit price
    expect(blocks).toContainEqual({ t: 'row', l: '11532  1 x', r: '28.00' });
  });

  it('honours Template 2 toggles and drops all tax content on a no-tax sale', () => {
    const blocks = buildTemplate3Blocks(mapToTemplate3Data(outlet, base, {
      hasTax: false, showArabic: false, showLoyalty: false, showCustomerDetails: false,
      showAccountBalance: false, showDelivery: false, showBarcode: false, showFooterText: false,
    }));
    expect(titles(blocks)).toEqual([]);
    const all = texts(blocks);
    expect(all.some((s) => /TRN|VAT|Tax inclusive/.test(s))).toBe(false);
    expect(all.some((s) => /[؀-ۿ]/.test(s))).toBe(false);
    expect(blocks.some((b) => b.t === 'barcode')).toBe(false);
  });

  it('labels the receivable tender CREDIT ACCOUNT with paid / due rows', () => {
    const paymentBlock = {
      details: [{ label: 'Transferred to Accounts Receivable', amount: 90.25, received: false }],
      changeAmount: 0, hasReceivable: true, totalReceived: 0, transferredToAr: 90.25,
    };
    const blocks = buildTemplate3Blocks(mapToTemplate3Data(outlet, { ...base, payment: { ...base.payment, paymentBlock } }, {}));
    expect(blocks).toContainEqual({ t: 'row', l: 'CREDIT ACCOUNT', r: 'AED 90.25' });
    expect(blocks).toContainEqual({ t: 'row', l: 'Amount Due', r: '90.25' });
  });

  it('wraps long customer values and skips an Account No. that just repeats the name', () => {
    const name = 'ABDELAZIZ AIT BRAHIM CONTRACTING L.L.C';
    const blocks = buildTemplate3Blocks(mapToTemplate3Data(outlet, { ...base, customer: { ...base.customer, name, code: name } }, {}));
    expect(blocks).toContainEqual({ t: 'wrow', l: 'Customer', r: name });
    expect(blocks.some((b) => b.l === 'Account No.')).toBe(false);
  });

  it('takes the VAT% from the line labels, not VAT / taxable (sample prints 5, not 5.51)', () => {
    const grid = buildTemplate3Blocks(mapToTemplate3Data(outlet, buildSampleTxn(), {})).find((b) => b.t === 'taxGrid');
    expect(grid.rows[0][1]).toBe('5');
  });

  it('renders standalone HTML', () => {
    const html = buildTemplate3Html(mapToTemplate3Data(outlet, base, {}));
    expect(html).toContain('class="bbt3"');
    expect(html).toContain('CREDIT BALANCE DETAILS');
    expect(html).toContain('<svg');
  });
});

describe('Template 3 invoice mapping (silent print path)', () => {
  it('maps a real invoice + opts bag: dd-mm-yyyy date, loyalty, per-rate VAT, credit limit', () => {
    const invoice = { ...buildSampleInvoice(), createdAt: '2026-11-01T22:09:21' };
    const txn = mapInvoiceToTemplate3Txn(invoice, {
      showCreditBalance: true, creditPreviousBalance: 220, creditLimit: 1000, isReprint: true,
    });
    expect(txn.date).toBe('01-11-2026');
    expect(txn.time).toBe('22:09:21');
    expect(txn.loyalty).toEqual({ pointsEarned: 10, pointsRedeemed: 0, pointsBalance: 1250 });
    expect(txn.vatRows).toHaveLength(1);
    expect(txn.vatRows[0].rate).toBe(5);
    expect(txn.vatRows[0].vat).toBeCloseTo(4.9);
    expect(txn.balance.creditLimit).toBe(1000);
    expect(txn.isReprint).toBe(true);
  });

  it('builds data from the ESC/POS opts bag using the shared toggle keys', () => {
    const data = mapEscPosOptsToTemplate3Data(buildSampleInvoice(), {
      companyName: 'Shop', documentTitle: 'Tax Invoice', showLoyaltyPoints: false, showArabic: false,
      qrContent: 'https://x', showQRCode: true,
    });
    expect(data.business.nameEn).toBe('Shop');
    expect(data.loyalty).toBeNull();
    expect(data.flags.showArabic).toBe(false);
    expect(data.qrContent).toBe('https://x');
  });
});
