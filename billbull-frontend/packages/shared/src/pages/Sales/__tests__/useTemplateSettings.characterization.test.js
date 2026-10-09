import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useTemplateSettings } from '../POS/features/templateSettings/useTemplateSettings';
import { DEFAULT_RECEIPT_TEMPLATE_ID } from '../POS/receiptTemplates';

/**
 * CHARACTERIZATION — the POS print-template / designer settings domain.
 *
 * 123 pieces of state that were declared inline in POSSales.jsx and hydrated by a 125-line
 * run of `if (tpl.X != null) setY(tpl.X)` inside the init effect. None of it was reachable
 * from a test. The Phase 3 extraction moved the declarations and the hydration verbatim
 * into a hook.
 *
 * SCOPE. These tests cover the settings boundary only: defaults, the hydration contract,
 * setter behaviour and the one derived value the hook owns. The receipt/A4/ESC-POS output
 * these settings drive is already covered by posPrintUtils, posReceiptEscPos and
 * usePosPrinting; none of that is repeated here.
 *
 * These describe CURRENT behaviour. Where a setting is handled inconsistently it is
 * asserted as-is.
 */

const setup = (over = {}) => renderHook(() => useTemplateSettings({ branches: [], company: null, ...over }));

beforeEach(() => sessionStorage.clear());
afterEach(() => sessionStorage.clear());

describe('initial defaults', () => {
  it('seeds the outlet identity block', () => {
    const r = setup().result.current;
    expect(r.tplOutletName).toBe('BillBull Trading LLC');
    expect(r.tplOutletTrn).toBe('');
    expect(r.tplOutletAddress).toBe('Shop 12, Dubai Mall, Downtown Dubai');
    expect(r.tplOutletPhone).toBe('+971 4 123 4567');
    expect(r.tplLogoDataUrl).toBe(null);
    expect(r.tplStampDataUrl).toBe(null);
  });

  it('seeds the receipt template defaults', () => {
    const r = setup().result.current;
    expect(r.tplReceiptHeader).toBe('Thank you for shopping with us!');
    expect(r.tplReceiptHeaderAr).toBe('فاتورة مبيعات');
    expect(r.tplReceiptFooter).toBe('Returns accepted within 7 days with receipt.');
    expect(r.tplReceiptPaper).toBe('80mm');
    expect(r.tplReceiptShowLogo).toBe(true);
    expect(r.tplReceiptShowTrn).toBe(true);
    expect(r.tplReceiptShowBarcode).toBe(true);
  });

  it('seeds the invoice template defaults, including the A4 paper size', () => {
    const r = setup().result.current;
    expect(r.tplInvoiceHeader).toBe('TAX INVOICE');
    expect(r.tplInvoiceHeaderAr).toBe('فاتورة ضريبية');
    expect(r.tplInvoiceFooter).toBe('All prices inclusive of VAT at 5%.');
    expect(r.tplInvoicePaper).toBe('A4');
    expect(r.tplInvoiceQrPlacement).toBe('before');
  });

  it('seeds the return / credit-note and job-card defaults', () => {
    const r = setup().result.current;
    expect(r.tplReturnHeader).toBe('SALES RETURN / CREDIT NOTE');
    expect(r.tplReturnPaper).toBe('A4');
    expect(r.tplJobCardPaper).toBe('A4');
    expect(r.tplJobCardFooter).toBe('We are not responsible for data loss during repair.');
  });

  it('CHARACTERIZED BEHAVIOUR: optional sections default OFF, core sections default ON', () => {
    const r = setup().result.current;
    // Opt-in extras.
    [r.tplInvoiceShowBankDetails, r.tplInvoiceShowQRCode, r.tplInvoiceShowStamp,
      r.tplInvoiceShowSignature, r.tplInvoiceColItemImage, r.tplInvoiceColBarcode,
      r.tplReceiptShowStamp, r.tplReceiptShowNotes, r.tplReturnShowCreditBalance,
    ].forEach((v) => expect(v).toBe(false));
    // On by default.
    [r.tplInvoiceShowLogo, r.tplInvoiceShowCompanyDetails, r.tplInvoiceShowTrn,
      r.tplInvoiceShowCustomerDetails, r.tplInvoiceShowTerms, r.tplInvoiceShowNotes,
      r.tplInvoiceShowGrandTotalBanner, r.tplInvoiceColItemCode, r.tplInvoiceColBatchNo,
      r.tplInvoiceColDiscount, r.tplInvoiceColVatPct, r.tplInvoiceColVatAmt,
    ].forEach((v) => expect(v).toBe(true));
  });

  it('CHARACTERIZED QUIRK: tplInvoiceShowNotes defaults ON but tplReceiptShowNotes defaults OFF', () => {
    // Same-named toggle, opposite default, on the two surfaces that print the same sale.
    const r = setup().result.current;
    expect(r.tplInvoiceShowNotes).toBe(true);
    expect(r.tplReceiptShowNotes).toBe(false);
  });

  it('defaults Template 2 fully on except the opt-in QR code', () => {
    const r = setup().result.current;
    ['t2ShowLogo', 't2ShowCompanyDetails', 't2ShowTrn', 't2ShowArabic', 't2ShowCustomerDetails',
      't2ShowAccountBalance', 't2ShowDelivery', 't2ShowVatSummary', 't2ShowPaymentDetails',
      't2ShowLoyalty', 't2ShowFooterText', 't2ShowBarcode',
    ].forEach((k) => expect(r[k]).toBe(true));
    expect(r.t2ShowQRCode).toBe(false);
  });

  it('applies the same default shape to both Template 2 sub-tabs', () => {
    const r = setup().result.current;
    ['t2ReceiptShowLogo', 't2InvoiceShowLogo', 't2ReceiptShowArabic', 't2InvoiceShowArabic',
    ].forEach((k) => expect(r[k]).toBe(true));
    expect(r.t2ReceiptShowQRCode).toBe(false);
    expect(r.t2InvoiceShowQRCode).toBe(false);
  });

  it('selects the default receipt template', () => {
    expect(setup().result.current.receiptTemplateId).toBe(DEFAULT_RECEIPT_TEMPLATE_ID);
  });
});

describe('applyPrintTemplateConfig — hydration from the persisted blob', () => {
  const hydrate = (tpl, over = {}) => {
    const view = setup(over);
    act(() => view.result.current.applyPrintTemplateConfig(tpl));
    return view;
  };

  it('applies the fields the blob carries', () => {
    const view = hydrate({
      outletName: 'Acme Retail',
      receiptHeader: 'Welcome',
      invoicePaper: '80mm',
      invoiceShowLogo: false,
      receiptTemplateId: 'billbull-ar',
      t2ShowArabic: false,
    });
    const r = view.result.current;

    expect(r.tplOutletName).toBe('Acme Retail');
    expect(r.tplReceiptHeader).toBe('Welcome');
    expect(r.tplInvoicePaper).toBe('80mm');
    expect(r.tplInvoiceShowLogo).toBe(false);
    expect(r.receiptTemplateId).toBe('billbull-ar');
    expect(r.t2ShowArabic).toBe(false);
  });

  it('leaves every unmentioned field at its default — a partial blob is safe', () => {
    const view = hydrate({ outletName: 'Acme Retail' });
    const r = view.result.current;

    expect(r.tplOutletName).toBe('Acme Retail');
    expect(r.tplReceiptHeader).toBe('Thank you for shopping with us!');
    expect(r.tplInvoicePaper).toBe('A4');
    expect(r.tplInvoiceShowLogo).toBe(true);
  });

  it('CHARACTERIZED BEHAVIOUR: the guard is `!= null`, so null AND undefined fall through', () => {
    // A stored null does not clear a setting back to empty — it is ignored and the
    // default (or the previously applied value) stands.
    const view = hydrate({ outletName: null, receiptHeader: undefined, invoicePaper: null });
    const r = view.result.current;

    expect(r.tplOutletName).toBe('BillBull Trading LLC');
    expect(r.tplReceiptHeader).toBe('Thank you for shopping with us!');
    expect(r.tplInvoicePaper).toBe('A4');
  });

  it('CHARACTERIZED BEHAVIOUR: falsy-but-present values ARE applied', () => {
    // `!= null` admits false, 0 and '' — which is what lets a toggle be turned off and a
    // header be blanked by the designer.
    const view = hydrate({ invoiceShowLogo: false, outletName: '', receiptFooter: '' });
    const r = view.result.current;

    expect(r.tplInvoiceShowLogo).toBe(false);
    expect(r.tplOutletName).toBe('');
    expect(r.tplReceiptFooter).toBe('');
  });

  it('CHARACTERIZED BEHAVIOUR: values are stored raw, with no coercion or validation', () => {
    // Nothing normalises types here — a blob written by an older build applies as-is.
    const view = hydrate({ invoicePaper: 12345, invoiceShowLogo: 'yes', receiptTemplateId: 99 });
    const r = view.result.current;

    expect(r.tplInvoicePaper).toBe(12345);
    expect(r.tplInvoiceShowLogo).toBe('yes');
    expect(r.receiptTemplateId).toBe(99);
  });

  it('ignores a null or undefined blob without throwing', () => {
    const view = setup();
    act(() => view.result.current.applyPrintTemplateConfig(null));
    act(() => view.result.current.applyPrintTemplateConfig(undefined));
    expect(view.result.current.tplOutletName).toBe('BillBull Trading LLC');
  });

  it('ignores unknown keys', () => {
    const view = hydrate({ somethingNew: 'x', outletName: 'Acme' });
    expect(view.result.current.tplOutletName).toBe('Acme');
    expect(view.result.current).not.toHaveProperty('somethingNew');
  });

  it('never mutates the blob it was handed', () => {
    const blob = { outletName: 'Acme', invoiceShowLogo: false };
    const snapshot = JSON.parse(JSON.stringify(blob));
    const view = setup();
    act(() => view.result.current.applyPrintTemplateConfig(blob));
    expect(blob).toEqual(snapshot);
  });

  it('is idempotent, and a later blob wins over an earlier one', () => {
    const view = setup();
    act(() => view.result.current.applyPrintTemplateConfig({ outletName: 'First' }));
    act(() => view.result.current.applyPrintTemplateConfig({ outletName: 'First' }));
    expect(view.result.current.tplOutletName).toBe('First');

    act(() => view.result.current.applyPrintTemplateConfig({ outletName: 'Second' }));
    expect(view.result.current.tplOutletName).toBe('Second');
  });

  it('hydrates the Template 2 sub-tab sets independently of the shared set', () => {
    const view = hydrate({
      t2ShowLogo: false, t2ReceiptShowLogo: true, t2InvoiceShowLogo: false,
    });
    const r = view.result.current;

    expect(r.t2ShowLogo).toBe(false);
    expect(r.t2ReceiptShowLogo).toBe(true);
    expect(r.t2InvoiceShowLogo).toBe(false);
  });
});

describe('setters', () => {
  it('exposes a working setter for every value POSConsole drives', () => {
    const view = setup();
    act(() => {
      view.result.current.setTplInvoiceShowLogo(false);
      view.result.current.setTplReceiptPaper('58mm');
      view.result.current.setTplOutletName('Renamed');
      view.result.current.setReceiptTemplateId('billbull-ar');
      view.result.current.setT2ShowQRCode(true);
    });
    const r = view.result.current;

    expect(r.tplInvoiceShowLogo).toBe(false);
    expect(r.tplReceiptPaper).toBe('58mm');
    expect(r.tplOutletName).toBe('Renamed');
    expect(r.receiptTemplateId).toBe('billbull-ar');
    expect(r.t2ShowQRCode).toBe(true);
  });

  it('pairs every returned value with a setter', () => {
    const r = setup().result.current;
    const values = Object.keys(r).filter((k) => k.startsWith('tpl') || k.startsWith('t2') || k === 'receiptTemplateId');
    values.forEach((k) => {
      const setter = `set${k.charAt(0).toUpperCase()}${k.slice(1)}`;
      expect(typeof r[setter]).toBe('function');
    });
    // 123 values + 123 setters + effectiveOutletTrn + applyPrintTemplateConfig.
    expect(values).toHaveLength(123);
  });
});

describe('effectiveOutletTrn — the one derived value the hook owns', () => {
  const BRANCHES = [
    { id: 7, trnNumber: '100BRANCH700003' },
    { id: 9, trnNumber: '  ' },
  ];

  it('prefers the TRN typed into the designer', () => {
    const view = setup({ branches: BRANCHES, company: { trn: '100COMPANY00003' } });
    act(() => view.result.current.setTplOutletTrn('  100TYPED000003  '));
    expect(view.result.current.effectiveOutletTrn).toBe('100TYPED000003');
  });

  it('falls back to the active branch TRN when nothing is typed', () => {
    sessionStorage.setItem('activeBranchId', '7');
    const view = setup({ branches: BRANCHES, company: { trn: '100COMPANY00003' } });
    expect(view.result.current.effectiveOutletTrn).toBe('100BRANCH700003');
  });

  it('falls back to the company TRN when the branch TRN is absent', () => {
    sessionStorage.setItem('activeBranchId', '5');
    const view = setup({
      branches: [{ id: 5, trnNumber: null }],
      company: { trn: '100COMPANY00003' },
    });
    expect(view.result.current.effectiveOutletTrn).toBe('100COMPANY00003');
  });

  it('CHARACTERIZED QUIRK: a whitespace-only branch TRN suppresses the company fallback', () => {
    // The expression is (branch?.trnNumber || company?.trn || '').trim() — the trim
    // happens AFTER the ||, so '  ' is truthy, short-circuits before the company TRN is
    // consulted, and then trims to ''. Such a branch prints no TRN at all even though the
    // company profile has one.
    sessionStorage.setItem('activeBranchId', '9');
    const view = setup({ branches: BRANCHES, company: { trn: '100COMPANY00003' } });
    expect(view.result.current.effectiveOutletTrn).toBe('');
  });

  it('uses the company TRN under an "All Branches" selection', () => {
    sessionStorage.setItem('activeBranchId', 'ALL');
    const view = setup({ branches: BRANCHES, company: { trn: '100COMPANY00003' } });
    expect(view.result.current.effectiveOutletTrn).toBe('100COMPANY00003');
  });

  it('matches the branch id as a string, so a numeric id still resolves', () => {
    sessionStorage.setItem('activeBranchId', '7');
    const view = setup({ branches: [{ id: 7, trnNumber: 'X' }], company: null });
    expect(view.result.current.effectiveOutletTrn).toBe('X');
  });

  it('returns an empty string when no source has a TRN', () => {
    const view = setup({ branches: [], company: null });
    expect(view.result.current.effectiveOutletTrn).toBe('');
  });

  it('survives missing branches and company entirely', () => {
    sessionStorage.setItem('activeBranchId', '7');
    const view = setup({ branches: undefined, company: undefined });
    expect(view.result.current.effectiveOutletTrn).toBe('');
  });
});
